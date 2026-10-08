// Valores fixos (espelham as constraints CHECK do banco).

export const TZ = 'America/Fortaleza';

export const TIPOS_CHAMADO = [
  'Exame',
  'Alta',
  'Óbito',
  'Transferência interna',
  'Admissão',
  'Centro Cirúrgico',
  'UTI',
  'Hemodinâmica',
  'Outro',
] as const;
export type TipoChamado = (typeof TIPOS_CHAMADO)[number];

export const ORIGENS_CHAMADO = ['Telefone/central', 'Rádio – CC', 'Setor (enfermagem)', 'Outro'] as const;
export const RECURSOS = ['Maca', 'Cadeira de rodas', 'Cama', 'Só acompanhamento', 'Outro'] as const;
export const PRIORIDADES = ['Urgente', 'Prioritário', 'Rotina'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const MOTIVOS_ATRASO = [
  'Maqueiro indisponível',
  'Todos os maqueiros em atendimento',
  'Aguardando enfermagem',
  'Aguardando maca',
  'Aguardando paciente',
  'Elevador indisponível',
  'Setor de origem não liberou paciente',
  'Setor de destino não disponível',
  'Paciente em procedimento',
  'Intercorrência assistencial',
  'Problema de comunicação',
  'Outro',
] as const;

export const GRUPOS_MOTIVO: Record<string, string> = {
  'Maqueiro indisponível': 'Falta de maqueiro',
  'Todos os maqueiros em atendimento': 'Falta de maqueiro',
  'Aguardando enfermagem': 'Enfermagem / paciente',
  'Setor de origem não liberou paciente': 'Enfermagem / paciente',
  'Aguardando paciente': 'Enfermagem / paciente',
  'Paciente em procedimento': 'Enfermagem / paciente',
  'Intercorrência assistencial': 'Enfermagem / paciente',
  'Aguardando maca': 'Falta de maca',
  'Elevador indisponível': 'Elevador',
};
export const grupoMotivo = (m: string | null | undefined) => (m ? (GRUPOS_MOTIVO[m] ?? 'Outros') : null);

export const TIPOS_INDISPONIBILIDADE = ['Troca de plantão', 'Atestado', 'Falta', 'Compensação/Folga', 'Outro'] as const;
export const MOTIVOS_HABILITACAO = ['Troca de plantão', 'Cobertura', 'Hora extra / folga', 'Outro'] as const;

export type StatusChamado =
  | 'aguardando_maqueiro'
  | 'maqueiro_acionado'
  | 'em_atendimento'
  | 'aguardando_enfermagem'
  | 'aguardando_maca'
  | 'concluido'
  | 'cancelado';

export const STATUS_INFO: Record<StatusChamado | 'atrasado', { rotulo: string; icone: string; classe: string }> = {
  aguardando_maqueiro: { rotulo: 'Aguardando maqueiro', icone: '🟡', classe: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100' },
  maqueiro_acionado: { rotulo: 'Maqueiro acionado', icone: '🔵', classe: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100' },
  em_atendimento: { rotulo: 'Em atendimento', icone: '🟣', classe: 'bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100' },
  aguardando_enfermagem: { rotulo: 'Aguardando enfermagem', icone: '🟠', classe: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100' },
  aguardando_maca: { rotulo: 'Aguardando maca', icone: '🟤', classe: 'bg-amber-200 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100' },
  concluido: { rotulo: 'Concluído', icone: '🟢', classe: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100' },
  cancelado: { rotulo: 'Cancelado', icone: '⚫', classe: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100' },
  atrasado: { rotulo: 'Atrasado', icone: '🔴', classe: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100' },
};

export const STATUS_INTERMEDIARIOS: StatusChamado[] = [
  'maqueiro_acionado',
  'em_atendimento',
  'aguardando_enfermagem',
  'aguardando_maca',
];

export const SITUACAO_MAQUEIRO: Record<string, { rotulo: string; icone: string; classe: string }> = {
  disponivel: { rotulo: 'Disponível', icone: '🟢', classe: 'text-green-700 dark:text-green-300' },
  maqueiro_acionado: { rotulo: 'Acionado', icone: '🔵', classe: 'text-blue-700 dark:text-blue-300' },
  em_atendimento: { rotulo: 'Em atendimento', icone: '🔵', classe: 'text-blue-700 dark:text-blue-300' },
  aguardando_enfermagem: { rotulo: 'Aguardando enfermagem', icone: '🟠', classe: 'text-orange-700 dark:text-orange-300' },
  aguardando_maca: { rotulo: 'Aguardando maca', icone: '🟤', classe: 'text-amber-800 dark:text-amber-300' },
  intervalo: { rotulo: 'Intervalo', icone: '⚫', classe: 'text-slate-600 dark:text-slate-300' },
  indisponivel: { rotulo: 'Indisponível', icone: '⛔', classe: 'text-red-700 dark:text-red-300' },
  fora_escala: { rotulo: 'Fora da escala', icone: '⚪', classe: 'text-slate-400' },
};

export const ORDEM_PRIORIDADE: Record<string, number> = { Urgente: 0, Prioritário: 1, Rotina: 2 };

export const DOMINIO_LOGIN = 'maqueiros.cssl';
