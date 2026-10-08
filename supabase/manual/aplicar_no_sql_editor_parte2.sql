-- =====================================================================
-- PARTE 2 do app do maqueiro (rodar UMA vez no SQL Editor do Supabase).
-- Precisa ser feita à mão porque contém "drop", que pede confirmação.
--   1) libera o perfil "maqueiro" na tabela de perfis
--   2) bloqueia exclusão de intervalos, jornadas e ofertas (histórico)
--   3) atualiza o painel dos maqueiros (cronômetro do intervalo)
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('gestao','telefonista','setor','maqueiro'));

revoke delete on public.intervalos, public.jornadas, public.ofertas from authenticated;
drop trigger if exists intervalos_auditoria on public.intervalos;
create trigger intervalos_auditoria after insert or update or delete on public.intervalos
for each row execute function public.trg_auditoria_generica();
drop trigger if exists intervalos_sem_exclusao on public.intervalos;
create trigger intervalos_sem_exclusao before delete on public.intervalos
for each row execute function public.trg_bloquear_exclusao();
drop trigger if exists jornadas_auditoria on public.jornadas;
create trigger jornadas_auditoria after insert or update or delete on public.jornadas
for each row execute function public.trg_auditoria_generica();
drop trigger if exists jornadas_sem_exclusao on public.jornadas;
create trigger jornadas_sem_exclusao before delete on public.jornadas
for each row execute function public.trg_bloquear_exclusao();
drop trigger if exists ofertas_sem_exclusao on public.ofertas;
create trigger ofertas_sem_exclusao before delete on public.ofertas
for each row execute function public.trg_bloquear_exclusao();

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
revoke execute on function public.painel_maqueiros() from public, anon;
grant execute on function public.painel_maqueiros() to authenticated;

select 'PARTE 2 APLICADA' as resultado;
