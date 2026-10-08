-- =====================================================================
-- Migration 2: funções auxiliares, auditoria (triggers) e RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares de identidade
-- ---------------------------------------------------------------------
create or replace function public.papel_atual()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.papel from public.perfis p where p.id = auth.uid() and p.ativo;
$$;

create or replace function public.setor_atual()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.setor_id from public.perfis p where p.id = auth.uid() and p.ativo and p.papel = 'setor';
$$;

-- Decodifica texto em formato URL (%C3%A3 → ã). Usado no cabeçalho x-ator-nome,
-- que o front envia com encodeURIComponent porque cabeçalhos HTTP não aceitam acentos.
create or replace function public.url_decode(t text)
returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  r bytea := '';
  i int := 1;
  c text;
begin
  if t is null then return null; end if;
  t := replace(t, '+', ' ');
  while i <= length(t) loop
    c := substr(t, i, 1);
    if c = '%' and i + 2 <= length(t) then
      r := r || decode(substr(t, i + 1, 2), 'hex');
      i := i + 3;
    else
      r := r || convert_to(c, 'UTF8');
      i := i + 1;
    end if;
  end loop;
  return convert_from(r, 'UTF8');
exception when others then
  return t;
end;
$$;

-- Nome de quem está agindo: "Seu nome" informado no login (cabeçalho x-ator-nome)
-- ou o nome do perfil, seguido do usuário. Ex.: "Maria (telefonista)".
create or replace function public.ator_atual()
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_header text;
  v_nome   text;
  v_usuario text;
  v_perfil_nome text;
begin
  begin
    v_header := current_setting('request.headers', true)::json ->> 'x-ator-nome';
  exception when others then
    v_header := null;
  end;
  v_nome := left(nullif(btrim(public.url_decode(v_header)), ''), 60);
  select p.usuario, p.nome into v_usuario, v_perfil_nome from public.perfis p where p.id = auth.uid();
  if v_usuario is null then
    return coalesce(v_nome, 'sistema');
  end if;
  return coalesce(v_nome, v_perfil_nome) || ' (' || v_usuario || ')';
end;
$$;

create or replace function public.config_num(p_chave text, p_padrao numeric)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = p_chave), p_padrao);
$$;

create or replace function public.config_bool(p_chave text, p_padrao boolean)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (valor #>> '{}')::boolean from public.configuracoes where chave = p_chave), p_padrao);
$$;

-- Normaliza nomes (sem acento, caixa, espaço) para comparações como "São José" = "sao jose".
create or replace function public.normalizar(t text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
           translate(lower(coalesce(t, '')),
                     'áàâãäéèêëíìîïóòôõöúùûüçñ',
                     'aaaaaeeeeiiiiooooouuuucn'),
           '[^a-z0-9]', '', 'g');
$$;

-- Hora do servidor (o front usa para corrigir diferença de relógio).
create or replace function public.agora_servidor()
returns timestamptz
language sql stable
as $$ select now(); $$;

-- ---------------------------------------------------------------------
-- Auditoria
-- As funções RPC definem app.acao e app.justificativa (escopo da transação)
-- antes de alterar o chamado; o trigger grava uma linha por campo alterado.
-- ---------------------------------------------------------------------
create or replace function public.trg_chamados_auditoria()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  k       text;
  v_old   jsonb;
  v_new   jsonb;
  v_acao  text := coalesce(nullif(current_setting('app.acao', true), ''), 'alteracao');
  v_just  text := nullif(current_setting('app.justificativa', true), '');
  v_ator  text := public.ator_atual();
begin
  if tg_op = 'INSERT' then
    insert into public.chamado_eventos (chamado_id, entidade, entidade_id, usuario, acao, campo, valor_novo, justificativa)
    values (new.id, 'chamado', new.id::text, v_ator, 'criacao', 'numero', new.numero, v_just);
    return new;
  end if;

  if new.id is distinct from old.id or new.numero is distinct from old.numero then
    raise exception 'O número e o identificador do chamado não podem ser alterados.';
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for k in select jsonb_object_keys(v_new) loop
    continue when k in ('created_at');
    if (v_old -> k) is distinct from (v_new -> k) then
      insert into public.chamado_eventos (chamado_id, entidade, entidade_id, usuario, acao, campo, valor_antigo, valor_novo, justificativa)
      values (new.id, 'chamado', new.id::text, v_ator, v_acao, k, v_old ->> k, v_new ->> k, v_just);
    end if;
  end loop;
  return new;
end;
$$;

create trigger chamados_auditoria
after insert or update on public.chamados
for each row execute function public.trg_chamados_auditoria();

-- Auditoria genérica para cadastros (maqueiros, escala, setores, configurações etc.)
create or replace function public.trg_auditoria_generica()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  k       text;
  v_old   jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new   jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_id    text  := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'chave', v_old ->> 'chave');
  v_acao  text  := coalesce(nullif(current_setting('app.acao', true), ''), lower(tg_op));
  v_just  text  := nullif(current_setting('app.justificativa', true), '');
  v_ator  text  := public.ator_atual();
begin
  if tg_op = 'INSERT' then
    insert into public.chamado_eventos (entidade, entidade_id, usuario, acao, valor_novo, justificativa)
    values (tg_table_name, v_id, v_ator, v_acao, v_new::text, v_just);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.chamado_eventos (entidade, entidade_id, usuario, acao, valor_antigo, justificativa)
    values (tg_table_name, v_id, v_ator, v_acao, v_old::text, v_just);
    return old;
  end if;

  for k in select jsonb_object_keys(v_new) loop
    continue when k in ('created_at');
    if (v_old -> k) is distinct from (v_new -> k) then
      insert into public.chamado_eventos (entidade, entidade_id, usuario, acao, campo, valor_antigo, valor_novo, justificativa)
      values (tg_table_name, v_id, v_ator, v_acao, k, v_old ->> k, v_new ->> k, v_just);
    end if;
  end loop;
  return new;
end;
$$;

create trigger maqueiros_auditoria after insert or update or delete on public.maqueiros
for each row execute function public.trg_auditoria_generica();
create trigger escala_dias_auditoria after insert or update or delete on public.escala_dias
for each row execute function public.trg_auditoria_generica();
create trigger habilitacoes_auditoria after insert or update or delete on public.habilitacoes
for each row execute function public.trg_auditoria_generica();
create trigger indisponibilidades_auditoria after insert or update or delete on public.indisponibilidades
for each row execute function public.trg_auditoria_generica();
create trigger setores_auditoria after insert or update or delete on public.setores
for each row execute function public.trg_auditoria_generica();
create trigger configuracoes_auditoria after insert or update or delete on public.configuracoes
for each row execute function public.trg_auditoria_generica();
create trigger perfis_auditoria after insert or update or delete on public.perfis
for each row execute function public.trg_auditoria_generica();

-- Nada é apagado: bloqueia DELETE mesmo para service_role (RLS não se aplica a ela).
create or replace function public.trg_bloquear_exclusao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Registros de % não podem ser excluídos. Use cancelamento ou inativação.', tg_table_name;
end;
$$;

create trigger chamados_sem_exclusao before delete on public.chamados
for each row execute function public.trg_bloquear_exclusao();
create trigger eventos_sem_exclusao before delete on public.chamado_eventos
for each row execute function public.trg_bloquear_exclusao();
create trigger maqueiros_sem_exclusao before delete on public.maqueiros
for each row execute function public.trg_bloquear_exclusao();
create trigger setores_sem_exclusao before delete on public.setores
for each row execute function public.trg_bloquear_exclusao();
create trigger habilitacoes_sem_exclusao before delete on public.habilitacoes
for each row execute function public.trg_bloquear_exclusao();
create trigger indisponibilidades_sem_exclusao before delete on public.indisponibilidades
for each row execute function public.trg_bloquear_exclusao();

-- O histórico é imutável.
create or replace function public.trg_eventos_imutaveis()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'O histórico de alterações não pode ser modificado.';
end;
$$;
create trigger eventos_imutaveis before update on public.chamado_eventos
for each row execute function public.trg_eventos_imutaveis();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.setores            enable row level security;
alter table public.perfis             enable row level security;
alter table public.maqueiros          enable row level security;
alter table public.escala_dias        enable row level security;
alter table public.habilitacoes       enable row level security;
alter table public.indisponibilidades enable row level security;
alter table public.sequencia_chamados enable row level security;
alter table public.chamados           enable row level security;
alter table public.chamado_eventos    enable row level security;
alter table public.configuracoes      enable row level security;

-- Sem login, nada.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Escrita direta bloqueada nas tabelas operacionais (somente via funções RPC).
revoke insert, update, delete, truncate on public.chamados, public.chamado_eventos, public.sequencia_chamados,
  public.habilitacoes, public.indisponibilidades, public.escala_dias, public.perfis from authenticated;
revoke delete, truncate on public.setores, public.maqueiros, public.configuracoes from authenticated;
grant select on public.setores, public.perfis, public.maqueiros, public.escala_dias, public.habilitacoes,
  public.indisponibilidades, public.chamados, public.chamado_eventos, public.configuracoes to authenticated;
grant insert, update on public.setores, public.maqueiros, public.configuracoes to authenticated;

-- setores
create policy setores_leitura on public.setores for select to authenticated
  using (public.papel_atual() is not null);
create policy setores_insert_gestao on public.setores for insert to authenticated
  with check (public.papel_atual() = 'gestao');
create policy setores_update_gestao on public.setores for update to authenticated
  using (public.papel_atual() = 'gestao') with check (public.papel_atual() = 'gestao');

-- perfis: cada um vê o próprio; gestão vê todos. Escrita apenas via Edge Function (service_role).
create policy perfis_leitura on public.perfis for select to authenticated
  using (id = auth.uid() or public.papel_atual() = 'gestao');

-- maqueiros
create policy maqueiros_leitura on public.maqueiros for select to authenticated
  using (public.papel_atual() is not null);
create policy maqueiros_insert_gestao on public.maqueiros for insert to authenticated
  with check (public.papel_atual() = 'gestao');
create policy maqueiros_update_gestao on public.maqueiros for update to authenticated
  using (public.papel_atual() = 'gestao') with check (public.papel_atual() = 'gestao');

-- escala, habilitações, indisponibilidades: leitura para autenticados; escrita via RPC
create policy escala_leitura on public.escala_dias for select to authenticated
  using (public.papel_atual() is not null);
create policy habilitacoes_leitura on public.habilitacoes for select to authenticated
  using (public.papel_atual() is not null);
create policy indisponibilidades_leitura on public.indisponibilidades for select to authenticated
  using (public.papel_atual() is not null);

-- configurações
create policy configuracoes_leitura on public.configuracoes for select to authenticated
  using (public.papel_atual() is not null);
create policy configuracoes_insert_gestao on public.configuracoes for insert to authenticated
  with check (public.papel_atual() = 'gestao');
create policy configuracoes_update_gestao on public.configuracoes for update to authenticated
  using (public.papel_atual() = 'gestao') with check (public.papel_atual() = 'gestao');

-- chamados: gestão e telefonista veem todos; setor só os do próprio setor. Sem INSERT/UPDATE/DELETE direto.
create policy chamados_leitura on public.chamados for select to authenticated
  using (
    public.papel_atual() in ('gestao','telefonista')
    or (public.papel_atual() = 'setor' and setor_origem_id = public.setor_atual())
  );

-- histórico: gestão e telefonista; setor apenas dos próprios chamados
create policy eventos_leitura on public.chamado_eventos for select to authenticated
  using (
    public.papel_atual() in ('gestao','telefonista')
    or (
      public.papel_atual() = 'setor'
      and chamado_id is not null
      and exists (select 1 from public.chamados c where c.id = chamado_id and c.setor_origem_id = public.setor_atual())
    )
  );

-- sequencia_chamados: sem políticas → inacessível fora das funções security definer.
