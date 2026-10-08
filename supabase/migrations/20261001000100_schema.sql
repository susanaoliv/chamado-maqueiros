-- =====================================================================
-- Sistema de Chamados de Maqueiros · Casa de Saúde São Lucas
-- Migration 1: estrutura (tabelas, constraints, índices)
-- Regra: nada é apagado definitivamente. Não existem políticas de DELETE
-- nas tabelas operacionais; desativação por ativo = false.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Setores
-- ---------------------------------------------------------------------
create table public.setores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ativo       boolean not null default true,
  exige_leito boolean not null default false,
  ordem       int not null default 100,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.perfis (
  id         uuid primary key references auth.users(id) on delete restrict,
  usuario    text not null unique,
  papel      text not null check (papel in ('gestao','telefonista','setor')),
  setor_id   uuid null references public.setores(id),
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint perfis_setor_obrigatorio check (papel <> 'setor' or setor_id is not null)
);

-- ---------------------------------------------------------------------
-- Maqueiros
-- ---------------------------------------------------------------------
create table public.maqueiros (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  matricula      text,
  turno          text not null default 'Diurno' check (turno in ('Diurno','Noturno')),
  horario_inicio time not null default '07:00',
  horario_fim    time not null default '19:00',
  setor_atuacao  text not null default 'Hospital',
  ativo          boolean not null default true,
  em_intervalo   boolean not null default false,
  created_at     timestamptz not null default now()
);

-- D diurno, N noturno (19h do dia até 07h do dia seguinte), E extra/folga trabalhada,
-- F férias/afastado. Sem registro = folga.
create table public.escala_dias (
  id          uuid primary key default gen_random_uuid(),
  maqueiro_id uuid not null references public.maqueiros(id),
  data        date not null,
  tipo        text not null check (tipo in ('D','N','E','F')),
  created_at  timestamptz not null default now(),
  unique (maqueiro_id, data)
);
create index escala_dias_data_idx on public.escala_dias (data);

create table public.habilitacoes (
  id          uuid primary key default gen_random_uuid(),
  maqueiro_id uuid not null references public.maqueiros(id),
  data        date not null,
  hora_inicio time not null,
  hora_fim    time not null,
  motivo      text not null check (motivo in ('Troca de plantão','Cobertura','Hora extra / folga','Outro')),
  observacao  text,
  criado_por  text,
  criado_em   timestamptz not null default now(),
  removido_em timestamptz null,
  removido_por text null
);
create index habilitacoes_data_idx on public.habilitacoes (data) where removido_em is null;

create table public.indisponibilidades (
  id            uuid primary key default gen_random_uuid(),
  maqueiro_id   uuid not null references public.maqueiros(id),
  tipo          text not null check (tipo in ('Troca de plantão','Atestado','Falta','Compensação/Folga','Outro')),
  justificativa text not null check (length(btrim(justificativa)) >= 3),
  inicio        timestamptz not null default now(),
  fim           timestamptz null,
  criado_por    text,
  encerrado_por text null,
  created_at    timestamptz not null default now(),
  constraint indisp_periodo check (fim is null or fim >= inicio)
);
create index indisponibilidades_abertas_idx on public.indisponibilidades (maqueiro_id) where fim is null;

-- ---------------------------------------------------------------------
-- Chamados
-- ---------------------------------------------------------------------
create table public.sequencia_chamados (
  ano int primary key,
  n   int not null default 0
);

create table public.chamados (
  id                     uuid primary key default gen_random_uuid(),
  numero                 text not null unique,
  aberto_em              timestamptz not null default now(),
  tipo                   text not null check (tipo in ('Exame','Alta','Óbito','Transferência interna','Admissão',
                                                       'Centro Cirúrgico','UTI','Hemodinâmica','Outro')),
  setor_origem_id        uuid not null references public.setores(id),
  leito_origem           text,
  setor_destino_id       uuid null references public.setores(id),
  destino_outro          text null,
  leito_destino          text null,
  paciente               text,
  origem_chamado         text not null default 'Telefone/central'
                           check (origem_chamado in ('Telefone/central','Rádio – CC','Setor (enfermagem)','Outro')),
  solicitante            text,
  recurso                text not null default 'Maca'
                           check (recurso in ('Maca','Cadeira de rodas','Cama','Só acompanhamento','Outro')),
  precisa_isolamento     boolean not null default false,
  precisa_oxigenio       boolean not null default false,
  prioridade             text not null default 'Rotina' check (prioridade in ('Urgente','Prioritário','Rotina')),
  observacao             text,
  status                 text not null default 'aguardando_maqueiro'
                           check (status in ('aguardando_maqueiro','maqueiro_acionado','em_atendimento',
                                             'aguardando_enfermagem','aguardando_maca','concluido','cancelado')),
  maqueiro_id            uuid null references public.maqueiros(id),
  maqueiro_informado_em  timestamptz null,
  inicio_atendimento_em  timestamptz null,
  encerrado_em           timestamptz null,
  motivo_atraso          text null check (motivo_atraso is null or motivo_atraso in (
                           'Maqueiro indisponível','Todos os maqueiros em atendimento','Aguardando enfermagem',
                           'Aguardando maca','Aguardando paciente','Elevador indisponível',
                           'Setor de origem não liberou paciente','Setor de destino não disponível',
                           'Paciente em procedimento','Intercorrência assistencial','Problema de comunicação','Outro')),
  motivo_atraso_texto    text null,
  cancelado_em           timestamptz null,
  cancelado_motivo       text null,
  cancelado_por          text null,
  criado_por             text,
  encerrado_por          text,
  created_at             timestamptz not null default now(),
  constraint chamados_concluido_tem_fim check (status <> 'concluido' or encerrado_em is not null),
  constraint chamados_cancelado_tem_motivo check (status <> 'cancelado' or (cancelado_em is not null and cancelado_motivo is not null)),
  constraint chamados_ordem_acionamento check (maqueiro_informado_em is null or maqueiro_informado_em >= aberto_em),
  constraint chamados_ordem_encerramento check (encerrado_em is null or encerrado_em >= aberto_em)
);
create index chamados_aberto_em_idx on public.chamados (aberto_em desc);
create index chamados_status_idx on public.chamados (status) where status not in ('concluido','cancelado');
create index chamados_setor_origem_idx on public.chamados (setor_origem_id, aberto_em desc);
create index chamados_maqueiro_idx on public.chamados (maqueiro_id, aberto_em desc);

-- Histórico / auditoria. Usado para chamados e também para cadastros
-- (maqueiros, escala, habilitações, indisponibilidades, setores, configurações).
create table public.chamado_eventos (
  id             bigint generated always as identity primary key,
  chamado_id     uuid null references public.chamados(id),
  entidade       text not null default 'chamado',
  entidade_id    text null,
  em             timestamptz not null default now(),
  usuario        text,
  acao           text not null,
  campo          text,
  valor_antigo   text,
  valor_novo     text,
  justificativa  text
);
create index chamado_eventos_chamado_idx on public.chamado_eventos (chamado_id, em);
create index chamado_eventos_em_idx on public.chamado_eventos (em desc);
create index chamado_eventos_entidade_idx on public.chamado_eventos (entidade, entidade_id);

create table public.configuracoes (
  chave text primary key,
  valor jsonb not null
);
