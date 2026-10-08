-- =====================================================================
-- Migration 8: registro do tempo de intervalo dos maqueiros
-- Cada intervalo vira uma linha (início, fim, quem registrou). Só pode
-- começar intervalo quem está de plantão/habilitado naquele momento.
-- Os dados alimentam o Dashboard (aba Intervalos) e os Relatórios.
-- =====================================================================

create table public.intervalos (
  id            uuid primary key default gen_random_uuid(),
  maqueiro_id   uuid not null references public.maqueiros(id),
  inicio        timestamptz not null default now(),
  fim           timestamptz null,
  criado_por    text,
  encerrado_por text,
  created_at    timestamptz not null default now(),
  constraint intervalos_periodo check (fim is null or fim >= inicio)
);
create index intervalos_inicio_idx on public.intervalos (inicio desc);
-- no máximo um intervalo aberto por maqueiro
create unique index intervalos_um_aberto_idx on public.intervalos (maqueiro_id) where fim is null;

alter table public.intervalos enable row level security;
revoke all on public.intervalos from anon;
revoke insert, update, delete, truncate on public.intervalos from authenticated;
grant select on public.intervalos to authenticated;
create policy intervalos_leitura on public.intervalos for select to authenticated
  using (public.papel_atual() in ('gestao','telefonista'));

create trigger intervalos_auditoria after insert or update or delete on public.intervalos
for each row execute function public.trg_auditoria_generica();
create trigger intervalos_sem_exclusao before delete on public.intervalos
for each row execute function public.trg_bloquear_exclusao();

-- Intervalo que estava marcado só no campo em_intervalo (antes desta versão) vira registro aberto
insert into public.intervalos (maqueiro_id, inicio, criado_por)
select id, now(), 'migração' from public.maqueiros where em_intervalo;

-- ---------------------------------------------------------------------
-- RPC: iniciar/encerrar intervalo
-- ---------------------------------------------------------------------
create or replace function public.definir_intervalo(p_maqueiro_id uuid, p_em_intervalo boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ator text;
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  v_ator := public.ator_atual();
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
  else
    perform set_config('app.acao', 'fim_intervalo', true);
    update public.intervalos set fim = now(), encerrado_por = v_ator
     where maqueiro_id = p_maqueiro_id and fim is null;
  end if;

  update public.maqueiros set em_intervalo = p_em_intervalo
   where id = p_maqueiro_id and em_intervalo is distinct from p_em_intervalo;
end;
$$;

-- Ao marcar indisponível, encerra o intervalo aberto (se houver)
create or replace function public.marcar_indisponivel(p_maqueiro_id uuid, p_tipo text, p_justificativa text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  if length(btrim(coalesce(p_justificativa, ''))) < 3 then
    raise exception 'Informe a justificativa da indisponibilidade.';
  end if;
  if exists (select 1 from public.indisponibilidades where maqueiro_id = p_maqueiro_id and fim is null) then
    raise exception 'Este maqueiro já está marcado como indisponível.';
  end if;
  update public.intervalos set fim = now(), encerrado_por = public.ator_atual()
   where maqueiro_id = p_maqueiro_id and fim is null;
  update public.maqueiros set em_intervalo = false where id = p_maqueiro_id and em_intervalo;
  perform set_config('app.acao', 'indisponibilidade', true);
  perform set_config('app.justificativa', btrim(p_justificativa), true);
  insert into public.indisponibilidades (maqueiro_id, tipo, justificativa, criado_por)
  values (p_maqueiro_id, p_tipo, btrim(p_justificativa), public.ator_atual())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Painel dos maqueiros: inclui início do intervalo atual e minutos de intervalo no dia
-- ---------------------------------------------------------------------
drop function if exists public.painel_maqueiros();
create function public.painel_maqueiros()
returns table (
  maqueiro_id uuid, nome text, matricula text, turno text, setor_atuacao text,
  horario_inicio time, horario_fim time,
  em_plantao boolean, turno_inicio timestamptz, turno_fim timestamptz, fonte text, tipo_escala text,
  habilitacao_id uuid, em_intervalo boolean,
  indisponibilidade_id uuid, indisponibilidade_tipo text, indisponibilidade_justificativa text,
  situacao text, chamados_ativos int, chamado_atual_numero text, chamado_atual_status text,
  disponivel_para_acionar boolean, escala_mes_cadastrada boolean,
  intervalo_inicio timestamptz, intervalos_hoje int, intervalo_min_hoje numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with t as (
    select distinct on (tp.maqueiro_id) tp.*
    from public.turnos_periodo(now(), now() + interval '1 second') tp
    where tp.inicio <= now() and tp.fim > now()
    order by tp.maqueiro_id, (tp.fonte = 'habilitacao') desc, tp.fim desc
  ),
  hab as (
    select distinct on (tp.maqueiro_id) tp.maqueiro_id, tp.habilitacao_id
    from public.turnos_periodo(now(), now() + interval '1 second') tp
    where tp.fonte = 'habilitacao' and tp.fim > now()
    order by tp.maqueiro_id, tp.inicio
  ),
  ind as (
    select distinct on (i.maqueiro_id) i.*
    from public.indisponibilidades i
    where i.inicio <= now() and (i.fim is null or i.fim > now())
    order by i.maqueiro_id, i.inicio desc
  ),
  ch as (
    select c.maqueiro_id,
           count(*)::int as qtd,
           (array_agg(c.numero order by c.maqueiro_informado_em desc))[1] as numero,
           (array_agg(c.status order by c.maqueiro_informado_em desc))[1] as status
    from public.chamados c
    where c.maqueiro_id is not null and c.status in ('maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca')
    group by c.maqueiro_id
  ),
  itv as (
    select i.maqueiro_id,
           max(i.inicio) filter (where i.fim is null) as aberto_desde,
           count(*)::int as qtd,
           round(sum(extract(epoch from (coalesce(i.fim, now()) - i.inicio))) / 60.0, 1) as minutos
    from public.intervalos i
    where i.inicio >= ((now() at time zone 'America/Fortaleza')::date + time '00:00') at time zone 'America/Fortaleza'
       or i.fim is null
    group by i.maqueiro_id
  )
  select m.id, m.nome, m.matricula, m.turno, m.setor_atuacao, m.horario_inicio, m.horario_fim,
         t.maqueiro_id is not null, t.inicio, t.fim, t.fonte, t.tipo,
         hab.habilitacao_id, m.em_intervalo,
         ind.id, ind.tipo, ind.justificativa,
         case
           when t.maqueiro_id is null then 'fora_escala'
           when ind.id is not null then 'indisponivel'
           when m.em_intervalo then 'intervalo'
           when ch.status is not null then ch.status
           else 'disponivel'
         end,
         coalesce(ch.qtd, 0), ch.numero, ch.status,
         (t.maqueiro_id is not null and ind.id is null and not m.em_intervalo),
         public.escala_cadastrada((now() at time zone 'America/Fortaleza')::date),
         itv.aberto_desde, coalesce(itv.qtd, 0), coalesce(itv.minutos, 0)
  from public.maqueiros m
  left join t   on t.maqueiro_id = m.id
  left join hab on hab.maqueiro_id = m.id
  left join ind on ind.maqueiro_id = m.id
  left join ch  on ch.maqueiro_id = m.id
  left join itv on itv.maqueiro_id = m.id
  where m.ativo and public.papel_atual() is not null
  order by (t.maqueiro_id is not null) desc, m.nome;
$$;
revoke execute on function public.painel_maqueiros() from public;
grant execute on function public.painel_maqueiros() to authenticated;

-- ---------------------------------------------------------------------
-- View para Dashboard, Relatórios e BI
-- ---------------------------------------------------------------------
create or replace view public.vw_intervalos
with (security_invoker = true) as
select
  i.id, i.maqueiro_id, m.nome as maqueiro_nome, i.inicio, i.fim, i.criado_por, i.encerrado_por,
  (i.inicio at time zone 'America/Fortaleza')::date                 as data_local,
  extract(hour from i.inicio at time zone 'America/Fortaleza')::int  as hora,
  i.fim is null                                                       as em_andamento,
  round(extract(epoch from (coalesce(i.fim, now()) - i.inicio)) / 60.0, 1) as minutos
from public.intervalos i
join public.maqueiros m on m.id = i.maqueiro_id;

grant select on public.vw_intervalos to authenticated;
revoke all on public.vw_intervalos from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.intervalos;
  end if;
end $$;
