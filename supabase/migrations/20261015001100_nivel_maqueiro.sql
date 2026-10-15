-- =====================================================================
-- Nível de permissão "Maqueiro" nos perfis personalizados.
-- Serve para separar grupos de maqueiros (ex.: Maqueiro CC, Maqueiro diarista).
-- As permissões são as mesmas do maqueiro padrão: só o app do celular.
-- =====================================================================

create or replace function public.telas_do_papel(p_papel text)
returns text[]
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_papel
    when 'gestao' then array['central','painel','maqueiros','registros','dashboard','capacidade','relatorios','escala','historico','configuracoes']
    when 'telefonista' then array['central','painel','maqueiros','registros']
    when 'setor' then array['meus-chamados']
    when 'maqueiro' then array['app']
    else array[]::text[]
  end;
$$;

alter table public.perfis_acesso drop constraint if exists perfis_acesso_papel_base_check;
alter table public.perfis_acesso add constraint perfis_acesso_papel_base_check
  check (papel_base in ('gestao','telefonista','setor','maqueiro'));

create or replace function public.trg_perfis_acesso_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_invalidas text[];
begin
  if new.papel_base not in ('gestao','telefonista','setor','maqueiro') then
    raise exception 'Nível de permissão inválido: %', new.papel_base;
  end if;
  new.nome := btrim(new.nome);
  new.telas := array(select distinct t from unnest(new.telas) t where t is not null);
  if coalesce(array_length(new.telas, 1), 0) = 0 then
    raise exception 'Marque pelo menos uma tela para o perfil.';
  end if;
  select array_agg(t) into v_invalidas from unnest(new.telas) t where not t = any (public.telas_do_papel(new.papel_base));
  if v_invalidas is not null then
    raise exception 'Telas não permitidas para este nível de permissão: %', array_to_string(v_invalidas, ', ');
  end if;
  if tg_op = 'UPDATE' then
    if new.papel_base is distinct from old.papel_base then
      raise exception 'O nível de permissão não pode ser trocado depois de criado. Crie um perfil novo.';
    end if;
    if old.ativo and not new.ativo and exists (select 1 from public.perfis p where p.perfil_acesso_id = new.id and p.ativo) then
      raise exception 'Ainda há usuários ativos com este perfil. Mude o perfil deles em Acessos antes de desativar.';
    end if;
  end if;
  return new;
end;
$$;
