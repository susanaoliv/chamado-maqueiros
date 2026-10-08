-- =====================================================================
-- Migration 9: App do maqueiro e despacho automático (modelo "fila de táxi")
--
-- Fluxo:
--   1. O maqueiro (perfil 'maqueiro', celular pessoal) inicia a JORNADA no app.
--      Só consegue se estiver na escala/habilitado pela Central e dentro do raio
--      do hospital (GPS).
--   2. Chamado aberto → o sistema OFERECE ao maqueiro livre há mais tempo.
--      Urgente → oferece a todos os livres ao mesmo tempo (o primeiro que aceitar leva).
--   3. A oferta vale N segundos (padrão 90). Recusa exige justificativa.
--      Recusa ou tempo esgotado → passa ao próximo da fila.
--   4. Maqueiros do CC recebem chamados do CC; nos fins de semana e feriados
--      recebem também os do hospital quando estiverem livres.
--   5. Ninguém disponível/aceitando → o chamado fica sinalizado para a Central
--      direcionar manualmente (a distribuição manual continua funcionando).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfil maqueiro
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('gestao','telefonista','setor','maqueiro'));
alter table public.perfis add column if not exists maqueiro_id uuid null references public.maqueiros(id);
alter table public.perfis add constraint perfis_maqueiro_obrigatorio
  check (papel <> 'maqueiro' or maqueiro_id is not null);
create unique index if not exists perfis_maqueiro_unico on public.perfis (maqueiro_id) where maqueiro_id is not null;

create or replace function public.meu_maqueiro()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.maqueiro_id from public.perfis p where p.id = auth.uid() and p.ativo and p.papel = 'maqueiro';
$$;

-- ---------------------------------------------------------------------
-- Jornadas, ofertas e campos de despacho no chamado
-- ---------------------------------------------------------------------
create table public.jornadas (
  id            uuid primary key default gen_random_uuid(),
  maqueiro_id   uuid not null references public.maqueiros(id),
  inicio        timestamptz not null default now(),
  fim           timestamptz null,
  lat           double precision,
  lng           double precision,
  precisao_m    double precision,
  distancia_m   double precision,
  encerrada_por text,
  created_at    timestamptz not null default now(),
  constraint jornadas_periodo check (fim is null or fim >= inicio)
);
create unique index jornadas_uma_aberta_idx on public.jornadas (maqueiro_id) where fim is null;
create index jornadas_inicio_idx on public.jornadas (inicio desc);

create table public.ofertas (
  id            uuid primary key default gen_random_uuid(),
  chamado_id    uuid not null references public.chamados(id),
  maqueiro_id   uuid not null references public.maqueiros(id),
  enviada_em    timestamptz not null default now(),
  expira_em     timestamptz not null,
  status        text not null default 'pendente'
                  check (status in ('pendente','aceita','recusada','expirada','cancelada')),
  respondida_em timestamptz null,
  justificativa text null,
  urgente       boolean not null default false,
  constraint ofertas_recusa_justificada check (status <> 'recusada' or length(btrim(coalesce(justificativa, ''))) >= 3)
);
create index ofertas_chamado_idx on public.ofertas (chamado_id, enviada_em);
create index ofertas_pendentes_idx on public.ofertas (maqueiro_id) where status = 'pendente';
create index ofertas_enviada_idx on public.ofertas (enviada_em desc);

alter table public.chamados add column if not exists despacho_reiniciado_em timestamptz null;
alter table public.chamados add column if not exists despacho_esgotado_em timestamptz null;

-- RLS: Central e NIR veem tudo; o maqueiro só o que é dele
alter table public.jornadas enable row level security;
alter table public.ofertas  enable row level security;
revoke all on public.jornadas, public.ofertas from anon;
revoke insert, update, delete, truncate on public.jornadas, public.ofertas from authenticated;
grant select on public.jornadas, public.ofertas to authenticated;
create policy jornadas_leitura on public.jornadas for select to authenticated
  using (public.papel_atual() in ('gestao','telefonista') or maqueiro_id = public.meu_maqueiro());
create policy ofertas_leitura on public.ofertas for select to authenticated
  using (public.papel_atual() in ('gestao','telefonista') or maqueiro_id = public.meu_maqueiro());

create trigger jornadas_auditoria after insert or update or delete on public.jornadas
for each row execute function public.trg_auditoria_generica();
create trigger jornadas_sem_exclusao before delete on public.jornadas
for each row execute function public.trg_bloquear_exclusao();
create trigger ofertas_sem_exclusao before delete on public.ofertas
for each row execute function public.trg_bloquear_exclusao();

-- ---------------------------------------------------------------------
-- Configurações do despacho
-- ---------------------------------------------------------------------
insert into public.configuracoes (chave, valor) values
  ('despacho_automatico', 'true'),
  ('oferta_timeout_s', '90'),
  ('hospital_raio_m', '300'),
  -- feriados nacionais de 2026 (estaduais/municipais: completar em Configurações)
  ('feriados', '["2026-01-01","2026-02-16","2026-02-17","2026-04-03","2026-04-21","2026-05-01","2026-06-04","2026-09-07","2026-10-12","2026-11-02","2026-11-15","2026-11-20","2026-12-25"]')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public.eh_dia_especial(p_data date)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select extract(dow from p_data) in (0, 6)
      or coalesce((select valor ? to_char(p_data, 'YYYY-MM-DD') from public.configuracoes where chave = 'feriados'), false);
$$;

create or replace function public.chamado_eh_cc(p_chamado_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.tipo = 'Centro Cirúrgico'
      or c.origem_chamado = 'Rádio – CC'
      or public.normalizar(so.nome) = 'centrocirurgico'
      or public.normalizar(sd.nome) = 'centrocirurgico'
  from public.chamados c
  join public.setores so on so.id = c.setor_origem_id
  left join public.setores sd on sd.id = c.setor_destino_id
  where c.id = p_chamado_id;
$$;

-- distância em metros (haversine)
create or replace function public.distancia_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
set search_path = public, pg_temp
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- "José da Silva" → "J. S." ; nº do atendimento fica como está (celular pessoal: dado mínimo)
create or replace function public.mascarar_paciente(p text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p is null then null
    when btrim(p) ~ '^[0-9./ -]+$' then btrim(p)
    else (select string_agg(upper(left(w, 1)) || '.', ' ')
          from regexp_split_to_table(btrim(p), '\s+') as w
          where length(w) > 2)
  end;
$$;

-- Candidatos para um chamado, na ordem da fila (livre há mais tempo primeiro)
create or replace function public.candidatos_despacho(p_chamado_id uuid)
returns table (maqueiro_id uuid, livre_desde timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with params as (
    select public.chamado_eh_cc(p_chamado_id) as cc,
           public.eh_dia_especial((now() at time zone 'America/Fortaleza')::date) as especial,
           coalesce(c.despacho_reiniciado_em, c.aberto_em) as ciclo
    from public.chamados c where c.id = p_chamado_id
  )
  select j.maqueiro_id,
         greatest(j.inicio, coalesce(ult.fim, j.inicio), coalesce(itv.fim, j.inicio)) as livre_desde
  from public.jornadas j
  cross join params p
  join public.maqueiros m on m.id = j.maqueiro_id and m.ativo and not m.em_intervalo
  left join lateral (
    select max(coalesce(c2.encerrado_em, c2.cancelado_em)) as fim from public.chamados c2 where c2.maqueiro_id = j.maqueiro_id
  ) ult on true
  left join lateral (
    select max(i.fim) as fim from public.intervalos i where i.maqueiro_id = j.maqueiro_id
  ) itv on true
  where j.fim is null
    and public.maqueiro_em_plantao(j.maqueiro_id, now())
    and not exists (select 1 from public.indisponibilidades i
                    where i.maqueiro_id = j.maqueiro_id and i.inicio <= now() and (i.fim is null or i.fim > now()))
    and not exists (select 1 from public.chamados c3
                    where c3.maqueiro_id = j.maqueiro_id
                      and c3.status in ('maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca'))
    and not exists (select 1 from public.ofertas o where o.maqueiro_id = j.maqueiro_id and o.status = 'pendente')
    and not exists (select 1 from public.ofertas o
                    where o.chamado_id = p_chamado_id and o.maqueiro_id = j.maqueiro_id
                      and o.status in ('recusada','expirada') and o.enviada_em >= p.ciclo)
    and (m.setor_atuacao <> 'CC' or p.cc or p.especial)
  order by (p.cc and m.setor_atuacao = 'CC') desc, 2 asc, m.nome;
$$;

-- ---------------------------------------------------------------------
-- Motor do despacho (idempotente; chamado por eventos, pelo app e pela Central)
-- ---------------------------------------------------------------------
create or replace function public.processar_despacho()
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c         record;
  m         record;
  n         int := 0;
  v_ofertou boolean;
  v_timeout int := public.config_num('oferta_timeout_s', 90)::int;
begin
  -- um processamento por vez (os demais simplesmente saem)
  if not pg_try_advisory_xact_lock(hashtext('despacho_maqueiros')) then
    return 0;
  end if;
  perform set_config('app.acao', 'despacho', true);

  update public.ofertas set status = 'expirada', respondida_em = expira_em
   where status = 'pendente' and expira_em <= now();

  update public.ofertas o set status = 'cancelada', respondida_em = now()
    from public.chamados ch
   where o.chamado_id = ch.id and o.status = 'pendente'
     and (ch.status <> 'aguardando_maqueiro' or ch.maqueiro_id is not null);

  if not public.config_bool('despacho_automatico', true) then
    return 0;
  end if;

  for c in
    select ch.id, ch.prioridade, ch.aberto_em, ch.despacho_esgotado_em, ch.despacho_reiniciado_em
    from public.chamados ch
    where ch.status = 'aguardando_maqueiro' and ch.maqueiro_id is null
      and not exists (select 1 from public.ofertas o where o.chamado_id = ch.id and o.status = 'pendente')
    order by case ch.prioridade when 'Urgente' then 0 when 'Prioritário' then 1 else 2 end, ch.aberto_em
  loop
    v_ofertou := false;
    for m in select * from public.candidatos_despacho(c.id) loop
      insert into public.ofertas (chamado_id, maqueiro_id, expira_em, urgente)
      values (c.id, m.maqueiro_id, now() + make_interval(secs => v_timeout), c.prioridade = 'Urgente');
      v_ofertou := true;
      n := n + 1;
      exit when c.prioridade <> 'Urgente';
    end loop;

    if v_ofertou and c.despacho_esgotado_em is not null then
      update public.chamados set despacho_esgotado_em = null where id = c.id;
    elsif not v_ofertou and c.despacho_esgotado_em is null
          and exists (select 1 from public.ofertas o
                      where o.chamado_id = c.id and o.enviada_em >= coalesce(c.despacho_reiniciado_em, c.aberto_em)) then
      -- já houve oferta e não há mais ninguém para oferecer: Central direciona
      update public.chamados set despacho_esgotado_em = now() where id = c.id;
    end if;
  end loop;
  return n;
end;
$$;

-- Dispara o despacho quando um chamado é aberto ou quando um maqueiro fica livre
create or replace function public.trg_chamados_despacho()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.processar_despacho();
  return null;
end;
$$;
create trigger chamados_despacho_insert after insert on public.chamados
for each row execute function public.trg_chamados_despacho();
create trigger chamados_despacho_update after update on public.chamados
for each row when (old.status is distinct from new.status or old.maqueiro_id is distinct from new.maqueiro_id)
execute function public.trg_chamados_despacho();

-- Central/NIR: recomeça a fila de um chamado (todos podem ser oferecidos de novo)
create or replace function public.redistribuir_chamado(p_chamado_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  perform set_config('app.acao', 'redistribuir', true);
  update public.chamados set despacho_reiniciado_em = now(), despacho_esgotado_em = null
   where id = p_chamado_id and status = 'aguardando_maqueiro' and maqueiro_id is null;
  if not found then raise exception 'O chamado não está aguardando maqueiro.'; end if;
  update public.ofertas set status = 'cancelada', respondida_em = now()
   where chamado_id = p_chamado_id and status = 'pendente';
  perform public.processar_despacho();
end;
$$;

-- ---------------------------------------------------------------------
-- Ações do maqueiro
-- ---------------------------------------------------------------------
create or replace function public.iniciar_jornada(p_lat double precision, p_lng double precision, p_precisao double precision default null)
returns public.jornadas
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_m    uuid;
  v_lat  numeric := public.config_num('hospital_lat', null);
  v_lng  numeric := public.config_num('hospital_lng', null);
  v_raio numeric := public.config_num('hospital_raio_m', 300);
  v_dist double precision;
  v_j    public.jornadas;
begin
  perform public.exigir_papel(array['maqueiro']);
  v_m := public.meu_maqueiro();
  if exists (select 1 from public.jornadas where maqueiro_id = v_m and fim is null) then
    raise exception 'Sua jornada já está iniciada.';
  end if;
  if not public.maqueiro_em_plantao(v_m, now()) then
    raise exception 'Você não está na escala deste horário nem habilitado. Procure a Central.';
  end if;
  if v_lat is null or v_lng is null then
    raise exception 'A localização do hospital ainda não foi configurada pela gestão.';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Permita o acesso à localização do celular para iniciar a jornada.';
  end if;
  v_dist := public.distancia_m(p_lat, p_lng, v_lat::double precision, v_lng::double precision);
  if v_dist > v_raio + least(coalesce(p_precisao, 0), 100) then
    raise exception 'Você está a % m do hospital. A jornada só pode ser iniciada dentro do hospital.', round(v_dist::numeric);
  end if;

  perform set_config('app.acao', 'inicio_jornada', true);
  insert into public.jornadas (maqueiro_id, lat, lng, precisao_m, distancia_m)
  values (v_m, p_lat, p_lng, p_precisao, round(v_dist::numeric, 1))
  returning * into v_j;
  perform public.processar_despacho();
  return v_j;
end;
$$;

-- Maqueiro encerra a própria jornada; Central/NIR podem encerrar a de qualquer um (esquecimento)
create or replace function public.encerrar_jornada(p_maqueiro_id uuid default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.exigir_papel(array['gestao','telefonista','maqueiro']);
  v_m     uuid := case when v_papel = 'maqueiro' then public.meu_maqueiro() else p_maqueiro_id end;
  v_ator  text := public.ator_atual();
begin
  if v_m is null then raise exception 'Informe o maqueiro.'; end if;
  if v_papel = 'maqueiro' and exists (
       select 1 from public.chamados where maqueiro_id = v_m
       and status in ('maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca')) then
    raise exception 'Conclua o chamado em andamento antes de encerrar a jornada.';
  end if;
  perform set_config('app.acao', 'fim_jornada', true);
  update public.jornadas set fim = now(), encerrada_por = v_ator where maqueiro_id = v_m and fim is null;
  if not found then raise exception 'Não há jornada aberta.'; end if;
  update public.ofertas set status = 'cancelada', respondida_em = now() where maqueiro_id = v_m and status = 'pendente';
  update public.intervalos set fim = now(), encerrado_por = v_ator where maqueiro_id = v_m and fim is null;
  update public.maqueiros set em_intervalo = false where id = v_m and em_intervalo;
  perform public.processar_despacho();
end;
$$;

create or replace function public.aceitar_oferta(p_oferta_id uuid)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_m uuid;
  o   public.ofertas;
  c   public.chamados;
begin
  perform public.exigir_papel(array['maqueiro']);
  v_m := public.meu_maqueiro();
  select * into o from public.ofertas where id = p_oferta_id for update;
  if not found or o.maqueiro_id is distinct from v_m then raise exception 'Oferta não encontrada.'; end if;
  select * into c from public.chamados where id = o.chamado_id for update;
  if o.status <> 'pendente' or o.expira_em + interval '5 seconds' <= now() then
    raise exception 'Esta oferta não está mais disponível.';
  end if;
  if c.status <> 'aguardando_maqueiro' or c.maqueiro_id is not null then
    raise exception 'Este chamado já foi assumido por outro maqueiro.';
  end if;

  update public.ofertas set status = 'aceita', respondida_em = now() where id = o.id;
  update public.ofertas set status = 'cancelada', respondida_em = now()
   where chamado_id = c.id and status = 'pendente' and id <> o.id;
  perform set_config('app.acao', 'aceite_app', true);
  update public.chamados
     set maqueiro_id = v_m, maqueiro_informado_em = now(), status = 'maqueiro_acionado', despacho_esgotado_em = null
   where id = c.id
  returning * into c;
  return c;
end;
$$;

create or replace function public.recusar_oferta(p_oferta_id uuid, p_justificativa text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_m uuid;
begin
  perform public.exigir_papel(array['maqueiro']);
  v_m := public.meu_maqueiro();
  if length(btrim(coalesce(p_justificativa, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.';
  end if;
  update public.ofertas set status = 'recusada', respondida_em = now(), justificativa = btrim(p_justificativa)
   where id = p_oferta_id and maqueiro_id = v_m and status = 'pendente';
  if not found then raise exception 'Esta oferta não está mais disponível.'; end if;
  perform public.processar_despacho();
end;
$$;

-- Intervalo: Central/NIR para qualquer um; o maqueiro para si mesmo (com jornada aberta)
create or replace function public.definir_intervalo(p_maqueiro_id uuid, p_em_intervalo boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.exigir_papel(array['gestao','telefonista','maqueiro']);
  v_ator  text := public.ator_atual();
begin
  if v_papel = 'maqueiro' then
    if p_maqueiro_id is distinct from public.meu_maqueiro() then
      raise exception 'Sem permissão para esta operação.' using errcode = '42501';
    end if;
    if p_em_intervalo and not exists (select 1 from public.jornadas where maqueiro_id = p_maqueiro_id and fim is null) then
      raise exception 'Inicie a jornada antes de registrar intervalo.';
    end if;
    if p_em_intervalo and exists (select 1 from public.chamados where maqueiro_id = p_maqueiro_id
         and status in ('maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca')) then
      raise exception 'Conclua o chamado em andamento antes do intervalo.';
    end if;
  end if;
  if not exists (select 1 from public.maqueiros where id = p_maqueiro_id and ativo) then
    raise exception 'Maqueiro não encontrado ou inativo.';
  end if;

  if p_em_intervalo then
    if not public.maqueiro_em_plantao(p_maqueiro_id, now()) then
      raise exception 'Só é possível registrar intervalo de maqueiro de plantão ou habilitado agora.';
    end if;
    if exists (select 1 from public.intervalos where maqueiro_id = p_maqueiro_id and fim is null) then
      raise exception 'Este maqueiro já está em intervalo.';
    end if;
    perform set_config('app.acao', 'inicio_intervalo', true);
    insert into public.intervalos (maqueiro_id, criado_por) values (p_maqueiro_id, v_ator);
    update public.ofertas set status = 'cancelada', respondida_em = now()
     where maqueiro_id = p_maqueiro_id and status = 'pendente';
  else
    perform set_config('app.acao', 'fim_intervalo', true);
    update public.intervalos set fim = now(), encerrado_por = v_ator
     where maqueiro_id = p_maqueiro_id and fim is null;
  end if;

  update public.maqueiros set em_intervalo = p_em_intervalo
   where id = p_maqueiro_id and em_intervalo is distinct from p_em_intervalo;
  perform public.processar_despacho();
end;
$$;

-- Status intermediários: Central/NIR em qualquer chamado; maqueiro só no próprio
create or replace function public.mudar_status(p_chamado_id uuid, p_status text)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.exigir_papel(array['gestao','telefonista','maqueiro']);
  v_c public.chamados;
begin
  if p_status not in ('aguardando_maqueiro','maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca') then
    raise exception 'Status inválido. Use Encerrar ou Cancelar para finalizar o chamado.';
  end if;
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_papel = 'maqueiro' then
    if v_c.maqueiro_id is distinct from public.meu_maqueiro() then raise exception 'Chamado não encontrado.'; end if;
    if p_status not in ('em_atendimento','aguardando_enfermagem','aguardando_maca') then
      raise exception 'Status não permitido pelo app.';
    end if;
  end if;
  if v_c.status in ('concluido','cancelado') then
    raise exception 'Chamado % já foi finalizado.', v_c.numero;
  end if;
  if p_status in ('maqueiro_acionado','em_atendimento') and v_c.maqueiro_id is null then
    raise exception 'Informe o maqueiro antes de mudar para este status.';
  end if;

  perform set_config('app.acao', case when v_papel = 'maqueiro' then 'status_app' else 'mudanca_status' end, true);
  update public.chamados
     set status = p_status,
         inicio_atendimento_em = case when p_status = 'em_atendimento' and inicio_atendimento_em is null
                                      then greatest(now(), coalesce(maqueiro_informado_em, aberto_em))
                                      else inicio_atendimento_em end
   where id = p_chamado_id
  returning * into v_c;
  return v_c;
end;
$$;

create or replace function public.encerrar_chamado(
  p_chamado_id uuid, p_motivo_atraso text default null, p_motivo_atraso_texto text default null)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.exigir_papel(array['gestao','telefonista','maqueiro']);
  v_c     public.chamados;
  v_sla   numeric := public.config_num('sla_minutos', 20);
  v_total numeric;
  v_mot   text := nullif(btrim(p_motivo_atraso), '');
  v_txt   text := nullif(btrim(p_motivo_atraso_texto), '');
begin
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_papel = 'maqueiro' and v_c.maqueiro_id is distinct from public.meu_maqueiro() then
    raise exception 'Chamado não encontrado.';
  end if;
  if v_c.status in ('concluido','cancelado') then
    raise exception 'Chamado % já foi finalizado.', v_c.numero;
  end if;
  if v_c.maqueiro_id is null then
    raise exception 'Informe o maqueiro antes de encerrar o chamado.';
  end if;

  v_total := extract(epoch from (now() - v_c.aberto_em)) / 60.0;
  if v_total > v_sla then
    if v_mot is null then
      raise exception 'Chamado passou do prazo (% min). Informe o motivo do atraso.', v_sla using errcode = 'P0001', hint = 'MOTIVO_ATRASO_OBRIGATORIO';
    end if;
    if v_mot = 'Outro' and v_txt is null then
      raise exception 'Descreva o motivo do atraso.';
    end if;
  end if;

  perform set_config('app.acao', case when v_papel = 'maqueiro' then 'encerramento_app' else 'encerramento' end, true);
  update public.chamados
     set status = 'concluido',
         encerrado_em = now(),
         encerrado_por = public.ator_atual(),
         motivo_atraso = v_mot,
         motivo_atraso_texto = v_txt
   where id = p_chamado_id
  returning * into v_c;
  return v_c;
end;
$$;

-- ---------------------------------------------------------------------
-- Estado do app (uma chamada traz tudo; também processa o despacho)
-- ---------------------------------------------------------------------
create or replace function public.chamado_app_json(p_chamado_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id, 'numero', c.numero, 'aberto_em', c.aberto_em, 'tipo', c.tipo, 'prioridade', c.prioridade,
    'recurso', c.recurso, 'precisa_isolamento', c.precisa_isolamento, 'precisa_oxigenio', c.precisa_oxigenio,
    'observacao', c.observacao, 'status', c.status,
    'setor_origem', so.nome, 'leito_origem', c.leito_origem,
    'setor_destino', coalesce(sd.nome, c.destino_outro), 'leito_destino', c.leito_destino,
    'paciente', public.mascarar_paciente(c.paciente),
    'maqueiro_informado_em', c.maqueiro_informado_em, 'inicio_atendimento_em', c.inicio_atendimento_em,
    'encerrado_em', c.encerrado_em
  )
  from public.chamados c
  join public.setores so on so.id = c.setor_origem_id
  left join public.setores sd on sd.id = c.setor_destino_id
  where c.id = p_chamado_id;
$$;

create or replace function public.app_maqueiro_estado()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_m uuid;
begin
  perform public.exigir_papel(array['maqueiro']);
  v_m := public.meu_maqueiro();
  perform public.processar_despacho();
  return jsonb_build_object(
    'agora', now(),
    'sla_minutos', public.config_num('sla_minutos', 20),
    'oferta_timeout_s', public.config_num('oferta_timeout_s', 90),
    'hospital_configurado', public.config_num('hospital_lat', null) is not null,
    'maqueiro', (select jsonb_build_object('id', m.id, 'nome', m.nome, 'setor_atuacao', m.setor_atuacao,
                                           'horario_inicio', m.horario_inicio, 'horario_fim', m.horario_fim)
                 from public.maqueiros m where m.id = v_m),
    'em_plantao', public.maqueiro_em_plantao(v_m, now()),
    'indisponivel', exists (select 1 from public.indisponibilidades i
                            where i.maqueiro_id = v_m and i.inicio <= now() and (i.fim is null or i.fim > now())),
    'jornada', (select jsonb_build_object('id', j.id, 'inicio', j.inicio) from public.jornadas j
                where j.maqueiro_id = v_m and j.fim is null),
    'intervalo', (select jsonb_build_object('id', i.id, 'inicio', i.inicio) from public.intervalos i
                  where i.maqueiro_id = v_m and i.fim is null),
    'ofertas', coalesce((
       select jsonb_agg(jsonb_build_object('id', o.id, 'enviada_em', o.enviada_em, 'expira_em', o.expira_em,
                                           'urgente', o.urgente, 'chamado', public.chamado_app_json(o.chamado_id))
                        order by o.enviada_em)
       from public.ofertas o where o.maqueiro_id = v_m and o.status = 'pendente' and o.expira_em > now()), '[]'::jsonb),
    'chamado_ativo', (select public.chamado_app_json(c.id) from public.chamados c
                      where c.maqueiro_id = v_m
                        and c.status in ('maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca')
                      order by c.maqueiro_informado_em desc limit 1),
    'hoje', (select jsonb_build_object(
               'concluidos', count(*) filter (where c.status = 'concluido'),
               'minutos', coalesce(round(sum(extract(epoch from (c.encerrado_em - c.maqueiro_informado_em)) / 60.0)
                                         filter (where c.status = 'concluido')), 0))
             from public.chamados c
             where c.maqueiro_id = v_m
               and c.maqueiro_informado_em >= ((now() at time zone 'America/Fortaleza')::date + time '00:00') at time zone 'America/Fortaleza'),
    'recusas_hoje', (select count(*) from public.ofertas o where o.maqueiro_id = v_m and o.status = 'recusada'
                     and o.enviada_em >= ((now() at time zone 'America/Fortaleza')::date + time '00:00') at time zone 'America/Fortaleza')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Views para Dashboard/BI
-- ---------------------------------------------------------------------
create or replace view public.vw_ofertas
with (security_invoker = true) as
select o.*, m.nome as maqueiro_nome, c.numero as chamado_numero,
       (o.enviada_em at time zone 'America/Fortaleza')::date as data_local,
       extract(hour from o.enviada_em at time zone 'America/Fortaleza')::int as hora,
       round(extract(epoch from (o.respondida_em - o.enviada_em))::numeric, 0) as segundos_resposta
from public.ofertas o
join public.maqueiros m on m.id = o.maqueiro_id
join public.chamados c on c.id = o.chamado_id;

create or replace view public.vw_jornadas
with (security_invoker = true) as
select j.*, m.nome as maqueiro_nome,
       (j.inicio at time zone 'America/Fortaleza')::date as data_local,
       j.fim is null as em_andamento,
       round(extract(epoch from (coalesce(j.fim, now()) - j.inicio)) / 3600.0, 2) as horas
from public.jornadas j
join public.maqueiros m on m.id = j.maqueiro_id;

grant select on public.vw_ofertas, public.vw_jornadas to authenticated;
revoke all on public.vw_ofertas, public.vw_jornadas from anon;

-- ---------------------------------------------------------------------
-- Permissões das funções novas
-- ---------------------------------------------------------------------
revoke execute on function public.meu_maqueiro(), public.eh_dia_especial(date), public.chamado_eh_cc(uuid),
  public.distancia_m(double precision, double precision, double precision, double precision),
  public.mascarar_paciente(text), public.candidatos_despacho(uuid), public.trg_chamados_despacho(),
  public.chamado_app_json(uuid), public.processar_despacho(),
  public.iniciar_jornada(double precision, double precision, double precision), public.encerrar_jornada(uuid),
  public.aceitar_oferta(uuid), public.recusar_oferta(uuid, text), public.redistribuir_chamado(uuid),
  public.app_maqueiro_estado()
  from public, anon, authenticated;
-- meu_maqueiro é usada nas políticas de RLS (avaliadas como o usuário)
grant execute on function public.meu_maqueiro(), public.processar_despacho(), public.eh_dia_especial(date),
  public.iniciar_jornada(double precision, double precision, double precision), public.encerrar_jornada(uuid),
  public.aceitar_oferta(uuid), public.recusar_oferta(uuid, text), public.redistribuir_chamado(uuid),
  public.app_maqueiro_estado()
  to authenticated;

-- Realtime e processamento periódico (expira ofertas mesmo sem ninguém com o app aberto)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.ofertas, public.jornadas;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('despacho-maqueiros', '15 seconds', 'select public.processar_despacho()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: o despacho segue sendo processado pelos eventos e pelo app (%).', sqlerrm;
end $$;
