-- =====================================================================
-- Testes dos perfis de acesso personalizados (Configurações → Perfis).
-- Roda em transação e desfaz tudo no final (ROLLBACK).
-- =====================================================================
\set ON_ERROR_STOP 1
begin;

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.headers', '{"x-ator-nome":"Teste"}', true);
end $$;

-- Espera erro contendo um trecho da mensagem
create or replace function pg_temp.deve_falhar(p_sql text, p_trecho text, p_nome text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_trecho in sqlerrm) = 0 then
      raise exception 'FALHOU [%]: erro inesperado: %', p_nome, sqlerrm;
    end if;
    raise notice 'ok: %', p_nome;
    return;
  end;
  raise exception 'FALHOU [%]: deveria ter dado erro', p_nome;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'pa_gestao@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000b2', 'pa_tel@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000b3', 'pa_diretoria@maqueiros.cssl');
insert into public.perfis (id, usuario, papel, nome) values
  ('00000000-0000-0000-0000-0000000000b1', 'pa_gestao', 'gestao', 'Gestão'),
  ('00000000-0000-0000-0000-0000000000b2', 'pa_tel', 'telefonista', 'Telefonista'),
  ('00000000-0000-0000-0000-0000000000b3', 'pa_diretoria', 'gestao', 'Diretoria');

-- 1) Gestão cria perfil; telefonista não consegue
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
insert into public.perfis_acesso (id, nome, papel_base, telas)
values ('00000000-0000-0000-0000-00000000aa01', '  Diretoria ', 'gestao', array['dashboard','relatorios','dashboard']);
do $$ begin
  if (select nome from public.perfis_acesso where id = '00000000-0000-0000-0000-00000000aa01') <> 'Diretoria' then raise exception 'FALHOU: nome não foi limpo'; end if;
  if (select cardinality(telas) from public.perfis_acesso where id = '00000000-0000-0000-0000-00000000aa01') <> 2 then raise exception 'FALHOU: telas repetidas'; end if;
  raise notice 'ok: gestão cria perfil (nome e telas normalizados)';
end $$;

select pg_temp.deve_falhar($$insert into public.perfis_acesso (nome, papel_base, telas) values ('diretoria', 'gestao', array['dashboard'])$$, 'duplicate', 'nome repetido (sem diferenciar maiúsculas)');
select pg_temp.deve_falhar($$insert into public.perfis_acesso (nome, papel_base, telas) values ('Central noturna', 'telefonista', array['central','dashboard'])$$, 'não permitidas', 'tela fora do nível');
select pg_temp.deve_falhar($$insert into public.perfis_acesso (nome, papel_base, telas) values ('Vazio', 'telefonista', array[]::text[])$$, 'pelo menos uma tela', 'perfil sem tela');
select pg_temp.deve_falhar($$insert into public.perfis_acesso (nome, papel_base, telas) values ('Maqueiro 2', 'maqueiro', array['central'])$$, 'Nível de permissão inválido', 'nível maqueiro não permitido');
select pg_temp.deve_falhar($$update public.perfis_acesso set papel_base = 'telefonista', telas = array['central'] where id = '00000000-0000-0000-0000-00000000aa01'$$, 'não pode ser trocado', 'nível imutável');

reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select pg_temp.deve_falhar($$insert into public.perfis_acesso (nome, papel_base, telas) values ('Hack', 'gestao', array['configuracoes'])$$, 'row-level security', 'telefonista não cria perfil');
do $$ begin
  update public.perfis_acesso set telas = array['configuracoes'] where id = '00000000-0000-0000-0000-00000000aa01';
  if (select telas from public.perfis_acesso where id = '00000000-0000-0000-0000-00000000aa01') <> array['dashboard','relatorios'] then
    raise exception 'FALHOU: telefonista alterou perfil';
  end if;
  if (select count(*) from public.perfis_acesso) < 1 then raise exception 'FALHOU: telefonista não lê perfis'; end if;
  raise notice 'ok: telefonista lê, mas não altera perfis';
end $$;
reset role;

-- 2) Coerência do usuário com o perfil (feito pela Edge Function com service_role)
update public.perfis set perfil_acesso_id = '00000000-0000-0000-0000-00000000aa01' where usuario = 'pa_diretoria';
select pg_temp.deve_falhar($$update public.perfis set perfil_acesso_id = '00000000-0000-0000-0000-00000000aa01' where usuario = 'pa_tel'$$, 'não confere', 'papel diferente do nível');
select pg_temp.deve_falhar($$update public.perfis set papel = 'telefonista' where usuario = 'pa_diretoria'$$, 'não confere', 'trocar papel mantendo perfil');

-- 3) Não desativa perfil com usuário ativo; depois de liberar, desativa e não aceita novos
select pg_temp.deve_falhar($$update public.perfis_acesso set ativo = false where id = '00000000-0000-0000-0000-00000000aa01'$$, 'usuários ativos', 'desativar com usuário ativo');
update public.perfis set perfil_acesso_id = null where usuario = 'pa_diretoria';
update public.perfis_acesso set ativo = false where id = '00000000-0000-0000-0000-00000000aa01';
select pg_temp.deve_falhar($$update public.perfis set perfil_acesso_id = '00000000-0000-0000-0000-00000000aa01' where usuario = 'pa_diretoria'$$, 'desativado', 'perfil desativado não aceita usuário');

-- 4) Nada é apagado e tudo fica no histórico
select pg_temp.deve_falhar($$delete from public.perfis_acesso where id = '00000000-0000-0000-0000-00000000aa01'$$, '', 'exclusão bloqueada');
do $$ begin
  if not exists (select 1 from public.chamado_eventos where entidade = 'perfis_acesso' and campo = 'ativo') then
    raise exception 'FALHOU: auditoria do perfil';
  end if;
  raise notice 'ok: auditoria registra mudanças do perfil';
end $$;

select 'PERFIS DE ACESSO: TODOS OS TESTES PASSARAM' as resultado;
rollback;
