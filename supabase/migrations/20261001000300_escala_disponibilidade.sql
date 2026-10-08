-- =====================================================================
-- Migration 3: escala, disponibilidade e capacidade dos maqueiros
-- Fuso de referência: America/Fortaleza (UTC-3, sem horário de verão)
-- =====================================================================

-- Indica se o mês da data tem alguma escala cadastrada. Sem escala → fallback
-- pelo horário padrão de cada maqueiro, todos os dias (com aviso na tela).
create or replace function public.escala_cadastrada(p_data date)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.escala_dias
    where data >= date_trunc('month', p_data)::date
      and data <  (date_trunc('month', p_data) + interval '1 month')::date
  );
$$;

-- Todos os turnos (escala + fallback + habilitações) que tocam o intervalo [p_de, p_ate).
-- Regras:
--   D: horário padrão do maqueiro; se o padrão for noturno, usa 07h–19h
--   N: horário padrão se for noturno; senão 19h do dia até 07h do dia seguinte
--   E: horário padrão do maqueiro
--   F / sem registro: não trabalha
--   Mês sem escala: horário padrão todos os dias (fonte = 'padrao')
--   Habilitação ativa: data + hora_inicio até hora_fim (atravessa a meia-noite se fim <= início)
create or replace function public.turnos_periodo(p_de timestamptz, p_ate timestamptz)
returns table (maqueiro_id uuid, inicio timestamptz, fim timestamptz, fonte text, tipo text, habilitacao_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with dias as (
    select g::date as dia
    from generate_series((p_de at time zone 'America/Fortaleza')::date - 1,
                         (p_ate at time zone 'America/Fortaleza')::date,
                         interval '1 day') g
  ),
  meses as (
    select distinct date_trunc('month', dia)::date as mes, public.escala_cadastrada(dia) as tem
    from dias
  ),
  base as (
    select m.id as maqueiro_id, d.dia,
           case when e.tipo is not null then e.tipo
                when not ms.tem then 'P'
           end as tipo,
           m.horario_inicio as hi, m.horario_fim as hf
    from dias d
    join meses ms on ms.mes = date_trunc('month', d.dia)::date
    cross join public.maqueiros m
    left join public.escala_dias e on e.maqueiro_id = m.id and e.data = d.dia
    where m.ativo
  ),
  efetivo as (
    select maqueiro_id, dia, tipo,
           case
             when tipo = 'N' and hf > hi then time '19:00'
             when tipo = 'D' and hf <= hi then time '07:00'
             else hi
           end as hi_e,
           case
             when tipo = 'N' and hf > hi then time '07:00'
             when tipo = 'D' and hf <= hi then time '19:00'
             else hf
           end as hf_e
    from base
    where tipo in ('D','N','E','P')
  ),
  turnos as (
    select maqueiro_id,
           (dia + hi_e) at time zone 'America/Fortaleza' as inicio,
           (dia + hf_e + case when hf_e <= hi_e then interval '1 day' else interval '0' end) at time zone 'America/Fortaleza' as fim,
           case when tipo = 'P' then 'padrao' else 'escala' end as fonte,
           tipo,
           null::uuid as habilitacao_id
    from efetivo
    union all
    select h.maqueiro_id,
           (h.data + h.hora_inicio) at time zone 'America/Fortaleza',
           (h.data + h.hora_fim + case when h.hora_fim <= h.hora_inicio then interval '1 day' else interval '0' end) at time zone 'America/Fortaleza',
           'habilitacao', 'H', h.id
    from public.habilitacoes h
    join public.maqueiros m on m.id = h.maqueiro_id and m.ativo
    where h.removido_em is null
      and h.data between (p_de at time zone 'America/Fortaleza')::date - 1 and (p_ate at time zone 'America/Fortaleza')::date
  )
  select * from turnos t where t.inicio < p_ate and t.fim > p_de;
$$;

-- Está de plantão (escala/fallback/habilitação) no instante?
create or replace function public.maqueiro_em_plantao(p_maqueiro_id uuid, p_em timestamptz default now())
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.turnos_periodo(p_em, p_em + interval '1 second') t
    where t.maqueiro_id = p_maqueiro_id and t.inicio <= p_em and t.fim > p_em
  );
$$;

-- Disponível para acionamento: em plantão, ativo, fora de intervalo e sem indisponibilidade aberta.
create or replace function public.maqueiro_disponivel(p_maqueiro_id uuid, p_em timestamptz default now())
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.maqueiros m where m.id = p_maqueiro_id and m.ativo and not m.em_intervalo)
     and public.maqueiro_em_plantao(p_maqueiro_id, p_em)
     and not exists (
       select 1 from public.indisponibilidades i
       where i.maqueiro_id = p_maqueiro_id and i.inicio <= p_em and (i.fim is null or i.fim > p_em)
     );
$$;

-- Painel dos maqueiros (Central): todos os ativos, com situação atual.
-- situacao: disponivel | maqueiro_acionado | em_atendimento | aguardando_enfermagem | aguardando_maca
--           | intervalo | indisponivel | fora_escala
create or replace function public.painel_maqueiros()
returns table (
  maqueiro_id uuid, nome text, matricula text, turno text, setor_atuacao text,
  horario_inicio time, horario_fim time,
  em_plantao boolean, turno_inicio timestamptz, turno_fim timestamptz, fonte text, tipo_escala text,
  habilitacao_id uuid, em_intervalo boolean,
  indisponibilidade_id uuid, indisponibilidade_tipo text, indisponibilidade_justificativa text,
  situacao text, chamados_ativos int, chamado_atual_numero text, chamado_atual_status text,
  disponivel_para_acionar boolean, escala_mes_cadastrada boolean
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
         public.escala_cadastrada((now() at time zone 'America/Fortaleza')::date)
  from public.maqueiros m
  left join t   on t.maqueiro_id = m.id
  left join hab on hab.maqueiro_id = m.id
  left join ind on ind.maqueiro_id = m.id
  left join ch  on ch.maqueiro_id = m.id
  where m.ativo and public.papel_atual() is not null
  order by (t.maqueiro_id is not null) desc, m.nome;
$$;

-- Capacidade x demanda hora a hora de um dia.
-- capacidade_calculada: maqueiros em plantão no meio da hora (hh:30), descontadas indisponibilidades.
-- capacidade_manual: configuração 'capacidade_manual' {"7": 6, "8": 6, ...} sobrescreve quando informada.
-- demanda_pico: maior número de chamados simultaneamente abertos dentro da hora (cancelados contam
--   até o cancelamento; abertos contam até agora).
create or replace function public.capacidade_dia(p_data date)
returns table (hora int, inicio timestamptz, capacidade_calculada int, capacidade_manual int, capacidade int,
               chamados_abertos int, demanda_pico int, deficit boolean)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_ini timestamptz := (p_data + time '00:00') at time zone 'America/Fortaleza';
  v_fim timestamptz := v_ini + interval '1 day';
  v_manual jsonb := (select valor from public.configuracoes where chave = 'capacidade_manual');
begin
  if public.papel_atual() not in ('gestao','telefonista') then
    raise exception 'Sem permissão.';
  end if;
  return query
  with horas as (
    select h, v_ini + make_interval(hours => h) as hi, v_ini + make_interval(hours => h + 1) as hf
    from generate_series(0, 23) h
  ),
  turnos as (select * from public.turnos_periodo(v_ini, v_fim)),
  cap as (
    select hr.h, count(distinct tr.maqueiro_id)::int as qtd
    from horas hr
    join turnos tr on tr.inicio <= hr.hi + interval '30 minutes' and tr.fim > hr.hi + interval '30 minutes'
    where not exists (
      select 1 from public.indisponibilidades i
      where i.maqueiro_id = tr.maqueiro_id
        and i.inicio <= hr.hi + interval '30 minutes'
        and (i.fim is null or i.fim > hr.hi + interval '30 minutes')
    )
    group by hr.h
  ),
  ch as (
    select c.aberto_em as ini,
           coalesce(c.encerrado_em, c.cancelado_em, greatest(now(), c.aberto_em)) as fim
    from public.chamados c
    where c.aberto_em < v_fim and coalesce(c.encerrado_em, c.cancelado_em, now()) > v_ini - interval '1 day'
  ),
  instantes as (
    select hr.h, hr.hi as t from horas hr
    union
    select hr.h, ch.ini from horas hr join ch on ch.ini >= hr.hi and ch.ini < hr.hf
  ),
  sim as (
    select i.h, max((select count(*) from ch where ch.ini <= i.t and ch.fim > i.t))::int as pico
    from instantes i group by i.h
  ),
  abertos as (
    select hr.h, count(c.id)::int as qtd
    from horas hr left join public.chamados c on c.aberto_em >= hr.hi and c.aberto_em < hr.hf
    group by hr.h
  )
  select hr.h,
         hr.hi,
         coalesce(cap.qtd, 0),
         (v_manual ->> hr.h::text)::int,
         coalesce((v_manual ->> hr.h::text)::int, cap.qtd, 0),
         coalesce(ab.qtd, 0),
         coalesce(sim.pico, 0),
         coalesce(sim.pico, 0) > coalesce((v_manual ->> hr.h::text)::int, cap.qtd, 0)
  from horas hr
  left join cap on cap.h = hr.h
  left join sim on sim.h = hr.h
  left join abertos ab on ab.h = hr.h
  order by hr.h;
end;
$$;

-- ---------------------------------------------------------------------
-- RPCs operacionais (Central e gestão)
-- ---------------------------------------------------------------------
create or replace function public.exigir_papel(p_papeis text[])
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v text := public.papel_atual();
begin
  if v is null or not (v = any (p_papeis)) then
    raise exception 'Sem permissão para esta operação.' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public.habilitar_maqueiro(
  p_maqueiro_id uuid, p_hora_inicio time default null, p_hora_fim time default null,
  p_motivo text default 'Troca de plantão', p_observacao text default null, p_data date default null)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.maqueiros;
  v_id uuid;
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  select * into v_m from public.maqueiros where id = p_maqueiro_id and ativo;
  if not found then raise exception 'Maqueiro não encontrado ou inativo.'; end if;
  perform set_config('app.acao', 'habilitacao', true);
  insert into public.habilitacoes (maqueiro_id, data, hora_inicio, hora_fim, motivo, observacao, criado_por)
  values (p_maqueiro_id,
          coalesce(p_data, (now() at time zone 'America/Fortaleza')::date),
          coalesce(p_hora_inicio, v_m.horario_inicio),
          coalesce(p_hora_fim, v_m.horario_fim),
          coalesce(p_motivo, 'Troca de plantão'),
          nullif(btrim(p_observacao), ''),
          public.ator_atual())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.desabilitar_maqueiro(p_habilitacao_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  perform set_config('app.acao', 'desabilitacao', true);
  update public.habilitacoes
     set removido_em = now(), removido_por = public.ator_atual()
   where id = p_habilitacao_id and removido_em is null;
  if not found then raise exception 'Habilitação não encontrada ou já removida.'; end if;
end;
$$;

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
  perform set_config('app.acao', 'indisponibilidade', true);
  perform set_config('app.justificativa', btrim(p_justificativa), true);
  insert into public.indisponibilidades (maqueiro_id, tipo, justificativa, criado_por)
  values (p_maqueiro_id, p_tipo, btrim(p_justificativa), public.ator_atual())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.disponibilizar_maqueiro(p_maqueiro_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  perform set_config('app.acao', 'disponibilizacao', true);
  update public.indisponibilidades
     set fim = now(), encerrado_por = public.ator_atual()
   where maqueiro_id = p_maqueiro_id and fim is null;
  if not found then raise exception 'Não há indisponibilidade aberta para este maqueiro.'; end if;
end;
$$;

create or replace function public.definir_intervalo(p_maqueiro_id uuid, p_em_intervalo boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  perform set_config('app.acao', case when p_em_intervalo then 'inicio_intervalo' else 'fim_intervalo' end, true);
  update public.maqueiros set em_intervalo = p_em_intervalo where id = p_maqueiro_id and ativo;
  if not found then raise exception 'Maqueiro não encontrado ou inativo.'; end if;
end;
$$;

-- Escala: define (ou limpa, com p_tipo nulo) um dia da grade. Somente gestão.
create or replace function public.definir_escala_dia(p_maqueiro_id uuid, p_data date, p_tipo text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.exigir_papel(array['gestao']);
  perform set_config('app.acao', 'escala', true);
  if p_tipo is null or btrim(p_tipo) = '' then
    delete from public.escala_dias where maqueiro_id = p_maqueiro_id and data = p_data;
  else
    insert into public.escala_dias (maqueiro_id, data, tipo) values (p_maqueiro_id, p_data, upper(p_tipo))
    on conflict (maqueiro_id, data) do update set tipo = excluded.tipo
    where public.escala_dias.tipo is distinct from excluded.tipo;
  end if;
end;
$$;

-- Importação em lote: [{"maqueiro_id": "...", "data": "2026-10-01", "tipo": "D" | null}, ...]
-- p_substituir_mes: limpa o mês dos maqueiros importados antes de gravar.
create or replace function public.importar_escala(p_linhas jsonb, p_mes date default null)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  n int := 0;
begin
  perform public.exigir_papel(array['gestao']);
  perform set_config('app.acao', 'importacao_escala', true);
  if p_mes is not null then
    delete from public.escala_dias e
     where e.data >= date_trunc('month', p_mes)::date
       and e.data < (date_trunc('month', p_mes) + interval '1 month')::date
       and e.maqueiro_id in (select distinct (x ->> 'maqueiro_id')::uuid from jsonb_array_elements(p_linhas) x);
  end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    if nullif(r ->> 'tipo', '') is null then
      delete from public.escala_dias where maqueiro_id = (r ->> 'maqueiro_id')::uuid and data = (r ->> 'data')::date;
    else
      insert into public.escala_dias (maqueiro_id, data, tipo)
      values ((r ->> 'maqueiro_id')::uuid, (r ->> 'data')::date, upper(r ->> 'tipo'))
      on conflict (maqueiro_id, data) do update set tipo = excluded.tipo
      where public.escala_dias.tipo is distinct from excluded.tipo;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
