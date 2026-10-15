-- =====================================================================
-- Perfis de acesso personalizados (aba Configurações → Perfis)
-- A gestão cria perfis novos (ex.: "Supervisão de enfermagem", "Diretoria").
-- Cada perfil tem:
--   papel_base: o nível de permissão no banco (gestao | telefonista | setor).
--               É ele que vale para as regras de segurança (RLS e RPCs).
--   telas:      quais telas aparecem no menu (só entre as que o nível permite).
-- Os 4 perfis padrão (Gestão NIR, Central, Enfermagem, Maqueiro) continuam
-- existindo e não ficam nesta tabela.
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
    else array[]::text[]
  end;
$$;

create table if not exists public.perfis_acesso (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 2 and 60),
  descricao   text,
  papel_base  text not null check (papel_base in ('gestao','telefonista','setor')),
  telas       text[] not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists perfis_acesso_nome_unico on public.perfis_acesso (lower(btrim(nome)));

alter table public.perfis add column if not exists perfil_acesso_id uuid references public.perfis_acesso(id);
create index if not exists perfis_perfil_acesso_idx on public.perfis (perfil_acesso_id);

-- Regras do perfil: telas válidas para o nível, nível fixo depois de criado,
-- e não desativa perfil que ainda tem usuário ativo.
create or replace function public.trg_perfis_acesso_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_invalidas text[];
begin
  if new.papel_base not in ('gestao','telefonista','setor') then
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

create or replace trigger perfis_acesso_validar before insert or update on public.perfis_acesso
for each row execute function public.trg_perfis_acesso_validar();
create or replace trigger perfis_acesso_auditoria after insert or update or delete on public.perfis_acesso
for each row execute function public.trg_auditoria_generica();
create or replace trigger perfis_acesso_sem_exclusao before delete on public.perfis_acesso
for each row execute function public.trg_bloquear_exclusao();

-- Usuário com perfil personalizado precisa ter o papel igual ao nível do perfil.
create or replace function public.trg_perfis_coerencia_acesso()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_ativo boolean;
begin
  if new.perfil_acesso_id is null then
    return new;
  end if;
  select pa.papel_base, pa.ativo into v_base, v_ativo from public.perfis_acesso pa where pa.id = new.perfil_acesso_id;
  if v_base is null then
    raise exception 'Perfil de acesso não encontrado.';
  end if;
  if new.papel is distinct from v_base then
    raise exception 'O papel do usuário (%) não confere com o nível do perfil (%).', new.papel, v_base;
  end if;
  if not v_ativo and (tg_op = 'INSERT' or new.perfil_acesso_id is distinct from old.perfil_acesso_id) then
    raise exception 'Este perfil de acesso está desativado.';
  end if;
  return new;
end;
$$;

create or replace trigger perfis_coerencia_acesso before insert or update of papel, perfil_acesso_id on public.perfis
for each row execute function public.trg_perfis_coerencia_acesso();

-- Segurança: todos os logados leem (o menu depende disso); só a gestão escreve.
alter table public.perfis_acesso enable row level security;
revoke all on public.perfis_acesso from public, anon, authenticated;
grant select, insert, update on public.perfis_acesso to authenticated;
revoke execute on function public.telas_do_papel(text) from public, anon;
grant execute on function public.telas_do_papel(text) to authenticated;

create policy perfis_acesso_leitura on public.perfis_acesso for select to authenticated
  using (public.papel_atual() is not null);
create policy perfis_acesso_insert_gestao on public.perfis_acesso for insert to authenticated
  with check (public.papel_atual() = 'gestao');
create policy perfis_acesso_update_gestao on public.perfis_acesso for update to authenticated
  using (public.papel_atual() = 'gestao') with check (public.papel_atual() = 'gestao');
