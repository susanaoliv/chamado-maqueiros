-- =====================================================================
-- Migration 5: views de métricas (dashboards e BI), permissões e Realtime
-- As views usam security_invoker: a RLS de chamados vale também para elas.
-- =====================================================================

create or replace function public.grupo_motivo_atraso(p_motivo text)
returns text
language sql immutable
as $$
  select case
    when p_motivo is null then null
    when p_motivo in ('Maqueiro indisponível','Todos os maqueiros em atendimento') then 'Falta de maqueiro'
    when p_motivo in ('Aguardando enfermagem','Setor de origem não liberou paciente','Aguardando paciente',
                      'Paciente em procedimento','Intercorrência assistencial') then 'Enfermagem / paciente'
    when p_motivo = 'Aguardando maca' then 'Falta de maca'
    when p_motivo = 'Elevador indisponível' then 'Elevador'
    else 'Outros'
  end;
$$;

create or replace view public.vw_chamados_metricas
with (security_invoker = true) as
select
  c.*,
  so.nome                                                             as setor_origem_nome,
  coalesce(sd.nome, c.destino_outro)                                  as setor_destino_nome,
  m.nome                                                              as maqueiro_nome,
  (c.aberto_em at time zone 'America/Fortaleza')::date                as data_local,
  extract(hour from c.aberto_em at time zone 'America/Fortaleza')::int as hora,
  extract(dow  from c.aberto_em at time zone 'America/Fortaleza')::int as dia_semana,
  case when extract(hour from c.aberto_em at time zone 'America/Fortaleza') between 7 and 18
       then 'Diurno' else 'Noturno' end                               as turno,
  round(extract(epoch from (c.maqueiro_informado_em - c.aberto_em)) / 60.0, 1)            as min_acionamento,
  round(extract(epoch from (c.inicio_atendimento_em - c.maqueiro_informado_em)) / 60.0, 1) as min_acionamento_atendimento,
  round(extract(epoch from (c.encerrado_em - c.aberto_em)) / 60.0, 1)                     as min_total,
  public.config_num('sla_minutos', 20)                                as sla_minutos,
  (c.status = 'concluido' and extract(epoch from (c.encerrado_em - c.aberto_em)) / 60.0 > public.config_num('sla_minutos', 20)) as atrasado,
  public.grupo_motivo_atraso(c.motivo_atraso)                         as grupo_motivo_atraso
from public.chamados c
join public.setores so on so.id = c.setor_origem_id
left join public.setores sd on sd.id = c.setor_destino_id
left join public.maqueiros m on m.id = c.maqueiro_id;

create or replace view public.vw_demanda_hora
with (security_invoker = true) as
select
  data_local,
  hora,
  count(*)                                              as chamados,
  count(*) filter (where status = 'concluido')          as concluidos,
  count(*) filter (where status = 'cancelado')          as cancelados,
  count(*) filter (where atrasado)                      as atrasados,
  round(avg(min_total) filter (where status = 'concluido'), 1) as tempo_medio_min,
  round(avg(min_acionamento), 1)                        as acionamento_medio_min
from public.vw_chamados_metricas
group by data_local, hora;

create or replace view public.vw_historico
with (security_invoker = true) as
select e.*, c.numero as chamado_numero
from public.chamado_eventos e
left join public.chamados c on c.id = e.chamado_id;

grant select on public.vw_chamados_metricas, public.vw_demanda_hora, public.vw_historico to authenticated;
revoke all on public.vw_chamados_metricas, public.vw_demanda_hora, public.vw_historico from anon;

-- ---------------------------------------------------------------------
-- Execução de funções: somente usuários autenticados
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
  end if;
end $$;
grant execute on all functions in schema public to authenticated;
-- funções internas não precisam ser chamadas diretamente
revoke execute on function public.trg_chamados_auditoria(), public.trg_auditoria_generica(),
  public.trg_bloquear_exclusao(), public.trg_eventos_imutaveis() from authenticated;

alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- Realtime (a RLS também filtra os eventos enviados a cada usuário)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chamados, public.habilitacoes,
      public.indisponibilidades, public.maqueiros, public.escala_dias, public.configuracoes;
  end if;
end $$;

alter table public.chamados replica identity full;
