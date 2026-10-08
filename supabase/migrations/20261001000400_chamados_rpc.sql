-- =====================================================================
-- Migration 4: funções RPC dos chamados
-- O front nunca faz INSERT/UPDATE direto em chamados: tudo passa por aqui.
-- =====================================================================

create or replace function public.chamado_aberto_minutos(p_aberto timestamptz, p_fim timestamptz default now())
returns numeric
language sql immutable
as $$ select round(extract(epoch from (p_fim - p_aberto)) / 60.0, 1); $$;

-- ---------------------------------------------------------------------
-- abrir_chamado
-- ---------------------------------------------------------------------
create or replace function public.abrir_chamado(
  p_tipo               text,
  p_setor_origem_id    uuid,
  p_leito_origem       text    default null,
  p_setor_destino_id   uuid    default null,
  p_destino_outro      text    default null,
  p_leito_destino      text    default null,
  p_paciente           text    default null,
  p_origem_chamado     text    default 'Telefone/central',
  p_solicitante        text    default null,
  p_recurso            text    default 'Maca',
  p_precisa_isolamento boolean default false,
  p_precisa_oxigenio   boolean default false,
  p_prioridade         text    default 'Rotina',
  p_observacao         text    default null,
  p_aberto_em          timestamptz default null,
  p_justificativa_hora text    default null
)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel     text := public.exigir_papel(array['gestao','telefonista','setor']);
  v_origem    public.setores;
  v_destino   public.setores;
  v_ano       int;
  v_n         int;
  v_aberto    timestamptz := now();
  v_row       public.chamados;
  v_leito_o   text := nullif(btrim(p_leito_origem), '');
  v_leito_d   text := nullif(btrim(p_leito_destino), '');
  v_dest_outro text := nullif(btrim(p_destino_outro), '');
  v_dest_id   uuid := p_setor_destino_id;
  v_origem_ch text := coalesce(nullif(p_origem_chamado, ''), 'Telefone/central');
  v_paciente  text := nullif(btrim(p_paciente), '');
  v_solic     text := nullif(btrim(p_solicitante), '');
begin
  -- Setor (enfermagem): origem sempre o próprio setor, origem do chamado fixa, solicitante obrigatório.
  if v_papel = 'setor' then
    p_setor_origem_id := public.setor_atual();
    v_origem_ch := 'Setor (enfermagem)';
    if v_solic is null then
      raise exception 'Informe o nome de quem está solicitando.';
    end if;
  end if;

  -- Hora de abertura: somente a gestão pode informar outra (com justificativa).
  if p_aberto_em is not null then
    if v_papel <> 'gestao' then
      raise exception 'Somente a gestão pode informar a hora de abertura.' using errcode = '42501';
    end if;
    if p_aberto_em > now() + interval '1 minute' then
      raise exception 'A hora de abertura não pode estar no futuro.';
    end if;
    if length(btrim(coalesce(p_justificativa_hora, ''))) < 3 then
      raise exception 'Informe a justificativa para registrar uma hora de abertura diferente da atual.';
    end if;
    v_aberto := p_aberto_em;
    perform set_config('app.justificativa', 'Hora de abertura informada pela gestão: ' || btrim(p_justificativa_hora), true);
  end if;

  select * into v_origem from public.setores where id = p_setor_origem_id and ativo;
  if not found then raise exception 'Setor de origem inválido ou inativo.'; end if;

  -- Regras por tipo
  if p_tipo = 'Alta' then
    v_dest_id := null; v_dest_outro := null; v_leito_d := null;
  elsif p_tipo = 'Óbito' then
    select id into v_dest_id from public.setores where public.normalizar(nome) = 'necroterio' limit 1;
    if v_dest_id is null then raise exception 'Setor Necrotério não cadastrado.'; end if;
    v_dest_outro := null;
  else
    if v_dest_id is null and v_dest_outro is null then
      raise exception 'Informe o setor de destino.';
    end if;
  end if;

  if v_dest_id is not null then
    select * into v_destino from public.setores where id = v_dest_id and ativo;
    if not found then raise exception 'Setor de destino inválido ou inativo.'; end if;
    v_dest_outro := null;
  end if;

  if p_tipo = 'Transferência interna' and (v_leito_o is null or v_leito_d is null) then
    raise exception 'Transferência interna exige leito de origem e leito de destino.';
  end if;

  if v_origem.exige_leito and v_leito_o is null then
    raise exception 'O setor % exige o número do leito de origem.', v_origem.nome;
  end if;

  if v_paciente is null then
    raise exception 'Informe o paciente ou o número do atendimento.';
  end if;
  if public.config_bool('usar_somente_numero_atendimento', false) and v_paciente !~ '^[0-9./ -]+$' then
    raise exception 'Informe somente o número do atendimento (sem nome do paciente).';
  end if;

  -- Número sequencial por ano, atômico (a linha do ano fica travada até o fim da transação).
  v_ano := extract(year from (v_aberto at time zone 'America/Fortaleza'))::int;
  insert into public.sequencia_chamados as s (ano, n) values (v_ano, 1)
  on conflict (ano) do update set n = s.n + 1
  returning s.n into v_n;

  insert into public.chamados (
    numero, aberto_em, tipo, setor_origem_id, leito_origem, setor_destino_id, destino_outro, leito_destino,
    paciente, origem_chamado, solicitante, recurso, precisa_isolamento, precisa_oxigenio, prioridade,
    observacao, status, criado_por
  ) values (
    'CH-' || v_ano || '-' || lpad(v_n::text, 6, '0'), v_aberto, p_tipo, p_setor_origem_id, v_leito_o, v_dest_id,
    v_dest_outro, v_leito_d, v_paciente, v_origem_ch, v_solic, coalesce(p_recurso, 'Maca'),
    coalesce(p_precisa_isolamento, false), coalesce(p_precisa_oxigenio, false), coalesce(p_prioridade, 'Rotina'),
    nullif(btrim(p_observacao), ''), 'aguardando_maqueiro', public.ator_atual()
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- acionar_maqueiro: informa o maqueiro. Só aceita maqueiro disponível agora.
-- A gestão pode informar outro horário (com justificativa).
-- ---------------------------------------------------------------------
create or replace function public.acionar_maqueiro(
  p_chamado_id uuid, p_maqueiro_id uuid, p_informado_em timestamptz default null, p_justificativa text default null)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.exigir_papel(array['gestao','telefonista']);
  v_c     public.chamados;
  v_em    timestamptz := now();
begin
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido','cancelado') then
    raise exception 'Chamado % já está %.', v_c.numero, case when v_c.status = 'concluido' then 'concluído' else 'cancelado' end;
  end if;
  if not public.maqueiro_disponivel(p_maqueiro_id, now()) then
    raise exception 'Maqueiro fora da escala, em intervalo ou indisponível. Habilite-o no painel dos maqueiros.';
  end if;

  if p_informado_em is not null then
    if v_papel <> 'gestao' then
      raise exception 'Somente a gestão pode informar outro horário de acionamento.' using errcode = '42501';
    end if;
    if length(btrim(coalesce(p_justificativa, ''))) < 3 then
      raise exception 'Informe a justificativa da correção de horário.';
    end if;
    v_em := p_informado_em;
    perform set_config('app.justificativa', btrim(p_justificativa), true);
  end if;

  perform set_config('app.acao', case when v_c.maqueiro_id is null then 'acionamento' else 'troca_maqueiro' end, true);
  update public.chamados
     set maqueiro_id = p_maqueiro_id,
         maqueiro_informado_em = v_em,
         status = case when status = 'aguardando_maqueiro' then 'maqueiro_acionado' else status end
   where id = p_chamado_id
  returning * into v_c;
  return v_c;
end;
$$;

-- ---------------------------------------------------------------------
-- mudar_status: status intermediários
-- ---------------------------------------------------------------------
create or replace function public.mudar_status(p_chamado_id uuid, p_status text)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.chamados;
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  if p_status not in ('aguardando_maqueiro','maqueiro_acionado','em_atendimento','aguardando_enfermagem','aguardando_maca') then
    raise exception 'Status inválido. Use Encerrar ou Cancelar para finalizar o chamado.';
  end if;
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido','cancelado') then
    raise exception 'Chamado % já foi finalizado.', v_c.numero;
  end if;
  if p_status in ('maqueiro_acionado','em_atendimento') and v_c.maqueiro_id is null then
    raise exception 'Informe o maqueiro antes de mudar para este status.';
  end if;

  perform set_config('app.acao', 'mudanca_status', true);
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

-- ---------------------------------------------------------------------
-- encerrar_chamado: grava término (servidor) e exige motivo se passou do SLA
-- ---------------------------------------------------------------------
create or replace function public.encerrar_chamado(
  p_chamado_id uuid, p_motivo_atraso text default null, p_motivo_atraso_texto text default null)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.chamados;
  v_sla   numeric := public.config_num('sla_minutos', 20);
  v_total numeric;
  v_mot   text := nullif(btrim(p_motivo_atraso), '');
  v_txt   text := nullif(btrim(p_motivo_atraso_texto), '');
begin
  perform public.exigir_papel(array['gestao','telefonista']);
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
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
  -- dentro do prazo o motivo é opcional; se informado, é gravado.

  perform set_config('app.acao', 'encerramento', true);
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
-- cancelar_chamado: telefonista, gestão e o próprio setor. Justificativa obrigatória.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_chamado(p_chamado_id uuid, p_justificativa text)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text := public.exigir_papel(array['gestao','telefonista','setor']);
  v_c     public.chamados;
begin
  if length(btrim(coalesce(p_justificativa, ''))) < 3 then
    raise exception 'Informe a justificativa do cancelamento.';
  end if;
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_papel = 'setor' and v_c.setor_origem_id is distinct from public.setor_atual() then
    -- mesma mensagem de "não encontrado" para não revelar chamados de outros setores
    raise exception 'Chamado não encontrado.';
  end if;
  if v_c.status in ('concluido','cancelado') then
    raise exception 'Chamado % já foi finalizado.', v_c.numero;
  end if;

  perform set_config('app.acao', 'cancelamento', true);
  perform set_config('app.justificativa', btrim(p_justificativa), true);
  update public.chamados
     set status = 'cancelado',
         cancelado_em = now(),
         cancelado_motivo = btrim(p_justificativa),
         cancelado_por = public.ator_atual()
   where id = p_chamado_id
  returning * into v_c;
  return v_c;
end;
$$;

-- ---------------------------------------------------------------------
-- corrigir_chamado: somente gestão, com justificativa obrigatória.
-- Campos: aberto_em, maqueiro_informado_em, inicio_atendimento_em, encerrado_em (timestamptz)
--         motivo_atraso, motivo_atraso_texto (texto)
-- ---------------------------------------------------------------------
create or replace function public.corrigir_chamado(
  p_chamado_id uuid, p_campo text, p_valor text, p_justificativa text)
returns public.chamados
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_c   public.chamados;
  v_ts  timestamptz;
begin
  perform public.exigir_papel(array['gestao']);
  if length(btrim(coalesce(p_justificativa, ''))) < 3 then
    raise exception 'A correção exige justificativa.';
  end if;
  if p_campo not in ('aberto_em','maqueiro_informado_em','inicio_atendimento_em','encerrado_em',
                     'motivo_atraso','motivo_atraso_texto') then
    raise exception 'Campo % não pode ser corrigido.', p_campo;
  end if;
  select * into v_c from public.chamados where id = p_chamado_id for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;

  if p_campo in ('aberto_em','maqueiro_informado_em','inicio_atendimento_em','encerrado_em') then
    v_ts := nullif(p_valor, '')::timestamptz;
    if v_ts is not null and v_ts > now() + interval '1 minute' then
      raise exception 'O horário não pode estar no futuro.';
    end if;
    if p_campo = 'aberto_em' and v_ts is null then raise exception 'A hora de abertura é obrigatória.'; end if;
    if p_campo = 'encerrado_em' and v_ts is null and v_c.status = 'concluido' then
      raise exception 'Chamado concluído precisa de horário de término.';
    end if;
    if p_campo = 'encerrado_em' and v_c.status <> 'concluido' and v_ts is not null then
      raise exception 'Só é possível corrigir o término de chamados concluídos.';
    end if;
  end if;

  perform set_config('app.acao', 'correcao', true);
  perform set_config('app.justificativa', btrim(p_justificativa), true);

  update public.chamados set
    aberto_em             = case when p_campo = 'aberto_em' then v_ts else aberto_em end,
    maqueiro_informado_em = case when p_campo = 'maqueiro_informado_em' then v_ts else maqueiro_informado_em end,
    inicio_atendimento_em = case when p_campo = 'inicio_atendimento_em' then v_ts else inicio_atendimento_em end,
    encerrado_em          = case when p_campo = 'encerrado_em' then v_ts else encerrado_em end,
    motivo_atraso         = case when p_campo = 'motivo_atraso' then nullif(p_valor, '') else motivo_atraso end,
    motivo_atraso_texto   = case when p_campo = 'motivo_atraso_texto' then nullif(p_valor, '') else motivo_atraso_texto end
  where id = p_chamado_id
  returning * into v_c;

  if v_c.inicio_atendimento_em is not null and v_c.maqueiro_informado_em is not null
     and v_c.inicio_atendimento_em < v_c.maqueiro_informado_em then
    raise exception 'O início do atendimento não pode ser anterior ao acionamento do maqueiro.';
  end if;
  if v_c.encerrado_em is not null and v_c.maqueiro_informado_em is not null
     and v_c.encerrado_em < v_c.maqueiro_informado_em then
    raise exception 'O término não pode ser anterior ao acionamento do maqueiro.';
  end if;
  return v_c;
end;
$$;
