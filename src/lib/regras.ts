// Regras de negócio espelhadas no front (o banco valida tudo de novo).
import { z } from 'zod';
import { PRIORIDADES, RECURSOS, ORIGENS_CHAMADO, TIPOS_CHAMADO, MOTIVOS_ATRASO, type TipoChamado } from './constantes';
import type { Setor } from '@/types/database';

/** Compara nomes ignorando acento, caixa e espaços. */
export function normalizar(t: string | null | undefined) {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Setores que exigem leito de origem (espelha setores.exige_leito do seed). */
export const SETORES_EXIGEM_LEITO = [
  'São José',
  'Santa Terezinha',
  'Nossa Senhora de Fátima',
  'São Judas Tadeu',
  'Santo Expedito',
  'TMO',
  'Padre João Maria',
  'Santa Luzia',
  'Santa Isabel',
  'UTI 1',
  'UTI 2',
  'UTI 3',
];

export function setorExigeLeito(setor: Pick<Setor, 'nome' | 'exige_leito'> | null | undefined) {
  if (!setor) return false;
  if (setor.exige_leito) return true;
  const n = normalizar(setor.nome);
  return SETORES_EXIGEM_LEITO.some((s) => normalizar(s) === n);
}

export const destinoVisivel = (tipo: string) => tipo !== 'Alta';
export const destinoTravadoNecroterio = (tipo: string) => tipo === 'Óbito';
export const leitoDestinoObrigatorio = (tipo: string) => tipo === 'Transferência interna';
export function leitoOrigemObrigatorio(tipo: string, setorOrigem: Pick<Setor, 'nome' | 'exige_leito'> | null | undefined) {
  return tipo === 'Transferência interna' || setorExigeLeito(setorOrigem);
}

export const DESTINO_OUTRO = '__outro__';

export type NovoChamadoForm = {
  tipo: TipoChamado;
  setor_origem_id: string;
  leito_origem: string;
  setor_destino_id: string; // id do setor, DESTINO_OUTRO ou ''
  destino_outro: string;
  leito_destino: string;
  paciente: string;
  origem_chamado: (typeof ORIGENS_CHAMADO)[number];
  solicitante: string;
  recurso: (typeof RECURSOS)[number];
  precisa_isolamento: boolean;
  precisa_oxigenio: boolean;
  prioridade: (typeof PRIORIDADES)[number];
  observacao: string;
  aberto_em: string; // datetime-local (só gestão)
  justificativa_hora: string;
};

export const valoresPadrao = (setorFixo?: string): NovoChamadoForm => ({
  tipo: 'Exame',
  setor_origem_id: setorFixo ?? '',
  leito_origem: '',
  setor_destino_id: '',
  destino_outro: '',
  leito_destino: '',
  paciente: '',
  origem_chamado: setorFixo ? 'Setor (enfermagem)' : 'Telefone/central',
  solicitante: '',
  recurso: 'Maca',
  precisa_isolamento: false,
  precisa_oxigenio: false,
  prioridade: 'Rotina',
  observacao: '',
  aberto_em: '',
  justificativa_hora: '',
});

type Contexto = {
  setores: Pick<Setor, 'id' | 'nome' | 'exige_leito'>[];
  papel: 'gestao' | 'telefonista' | 'setor';
  somenteNumeroAtendimento: boolean;
};

/** Schema do formulário com as regras condicionais. */
export function schemaNovoChamado(ctx: Contexto) {
  return z
    .object({
      tipo: z.enum(TIPOS_CHAMADO),
      setor_origem_id: z.string().min(1, 'Selecione o setor de origem'),
      leito_origem: z.string(),
      setor_destino_id: z.string(),
      destino_outro: z.string(),
      leito_destino: z.string(),
      paciente: z.string().trim().min(1, ctx.somenteNumeroAtendimento ? 'Informe o nº do atendimento' : 'Informe o paciente'),
      origem_chamado: z.enum(ORIGENS_CHAMADO),
      solicitante: z.string(),
      recurso: z.enum(RECURSOS),
      precisa_isolamento: z.boolean(),
      precisa_oxigenio: z.boolean(),
      prioridade: z.enum(PRIORIDADES),
      observacao: z.string(),
      aberto_em: z.string(),
      justificativa_hora: z.string(),
    })
    .superRefine((v, c) => {
      const origem = ctx.setores.find((s) => s.id === v.setor_origem_id);
      if (leitoOrigemObrigatorio(v.tipo, origem) && !v.leito_origem.trim()) {
        c.addIssue({ code: 'custom', path: ['leito_origem'], message: 'Leito de origem obrigatório' });
      }
      if (destinoVisivel(v.tipo) && !destinoTravadoNecroterio(v.tipo)) {
        if (!v.setor_destino_id) c.addIssue({ code: 'custom', path: ['setor_destino_id'], message: 'Selecione o destino' });
        if (v.setor_destino_id === DESTINO_OUTRO && !v.destino_outro.trim())
          c.addIssue({ code: 'custom', path: ['destino_outro'], message: 'Descreva o destino' });
      }
      if (leitoDestinoObrigatorio(v.tipo) && !v.leito_destino.trim()) {
        c.addIssue({ code: 'custom', path: ['leito_destino'], message: 'Leito de destino obrigatório' });
      }
      if (ctx.somenteNumeroAtendimento && v.paciente.trim() && !/^[0-9./ -]+$/.test(v.paciente.trim())) {
        c.addIssue({ code: 'custom', path: ['paciente'], message: 'Use somente o número do atendimento' });
      }
      if (ctx.papel === 'setor' && !v.solicitante.trim()) {
        c.addIssue({ code: 'custom', path: ['solicitante'], message: 'Informe quem está solicitando' });
      }
      if (ctx.papel === 'gestao' && v.aberto_em && v.justificativa_hora.trim().length < 3) {
        c.addIssue({ code: 'custom', path: ['justificativa_hora'], message: 'Justifique a hora informada' });
      }
    });
}

/** Converte o formulário nos argumentos da RPC abrir_chamado. */
export function paraArgsRpc(v: NovoChamadoForm, setores: Pick<Setor, 'id' | 'nome'>[], abertoEmIso: string | null) {
  const necroterio = setores.find((s) => normalizar(s.nome) === 'necroterio');
  let destinoId: string | null = null;
  let destinoOutro: string | null = null;
  if (destinoTravadoNecroterio(v.tipo)) destinoId = necroterio?.id ?? null;
  else if (destinoVisivel(v.tipo)) {
    if (v.setor_destino_id === DESTINO_OUTRO) destinoOutro = v.destino_outro.trim();
    else destinoId = v.setor_destino_id || null;
  }
  const vazio = (s: string) => (s.trim() ? s.trim() : null);
  return {
    p_tipo: v.tipo,
    p_setor_origem_id: v.setor_origem_id,
    p_leito_origem: vazio(v.leito_origem),
    p_setor_destino_id: destinoId,
    p_destino_outro: destinoOutro,
    p_leito_destino: destinoVisivel(v.tipo) ? vazio(v.leito_destino) : null,
    p_paciente: v.paciente.trim(),
    p_origem_chamado: v.origem_chamado,
    p_solicitante: vazio(v.solicitante),
    p_recurso: v.recurso,
    p_precisa_isolamento: v.precisa_isolamento,
    p_precisa_oxigenio: v.precisa_oxigenio,
    p_prioridade: v.prioridade,
    p_observacao: vazio(v.observacao),
    p_aberto_em: abertoEmIso,
    p_justificativa_hora: abertoEmIso ? vazio(v.justificativa_hora) : null,
  };
}

// ----------------------------------------------------------------------------
// SLA e atraso
// ----------------------------------------------------------------------------
export const ABERTOS = ['aguardando_maqueiro', 'maqueiro_acionado', 'em_atendimento', 'aguardando_enfermagem', 'aguardando_maca'];

export function estaAberto(status: string) {
  return ABERTOS.includes(status);
}

/** Chamado aberto cujo tempo decorrido passou do SLA → mostrado como 🔴 Atrasado. */
export function estaAtrasado(c: { status: string; aberto_em: string; encerrado_em?: string | null }, slaMin: number, agora: Date) {
  if (c.status === 'cancelado') return false;
  const fim = c.status === 'concluido' && c.encerrado_em ? new Date(c.encerrado_em) : agora;
  return (fim.getTime() - new Date(c.aberto_em).getTime()) / 60000 > slaMin;
}

/** Ao encerrar agora, será exigido motivo de atraso? */
export const exigeMotivoAtraso = (abertoEm: string, slaMin: number, agora: Date) =>
  (agora.getTime() - new Date(abertoEm).getTime()) / 60000 > slaMin;

export const schemaEncerramento = (exige: boolean) =>
  z
    .object({ motivo: z.string(), texto: z.string() })
    .superRefine((v, c) => {
      if (exige && !v.motivo) c.addIssue({ code: 'custom', path: ['motivo'], message: 'Informe o motivo do atraso' });
      if (v.motivo && !(MOTIVOS_ATRASO as readonly string[]).includes(v.motivo))
        c.addIssue({ code: 'custom', path: ['motivo'], message: 'Motivo inválido' });
      if (v.motivo === 'Outro' && !v.texto.trim())
        c.addIssue({ code: 'custom', path: ['texto'], message: 'Descreva o motivo' });
    });

// ----------------------------------------------------------------------------
// Escala (espelho da função SQL turnos_periodo, usado na grade e em testes)
// ----------------------------------------------------------------------------
export type TipoEscala = 'D' | 'N' | 'E' | 'F' | null;

const paraMin = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + (mm || 0);
};

/**
 * Turno efetivo de um maqueiro num dia (minutos desde 00:00 do dia; fim pode passar de 1440).
 * null = não trabalha. `escalaDoMes` = o mês tem alguma escala cadastrada.
 */
export function turnoDoDia(
  horarioInicio: string,
  horarioFim: string,
  tipo: TipoEscala,
  escalaDoMes: boolean,
): { inicio: number; fim: number } | null {
  let t: TipoEscala | 'P' = tipo;
  if (!t) t = escalaDoMes ? null : 'P';
  if (!t || t === 'F') return null;
  let hi = paraMin(horarioInicio);
  let hf = paraMin(horarioFim);
  if (t === 'N' && hf > hi) [hi, hf] = [19 * 60, 7 * 60];
  if (t === 'D' && hf <= hi) [hi, hf] = [7 * 60, 19 * 60];
  return { inicio: hi, fim: hf <= hi ? hf + 1440 : hf };
}

/**
 * Está de plantão no minuto `minuto` (0–1439) do dia `hoje`, considerando o turno de ontem
 * que atravessa a meia-noite?
 */
export function emPlantao(
  minuto: number,
  turnoHoje: { inicio: number; fim: number } | null,
  turnoOntem: { inicio: number; fim: number } | null,
) {
  if (turnoHoje && minuto >= turnoHoje.inicio && minuto < turnoHoje.fim) return true;
  if (turnoOntem && turnoOntem.fim > 1440 && minuto < turnoOntem.fim - 1440) return true;
  return false;
}

export const proximoTipoEscala = (t: TipoEscala): TipoEscala =>
  t === null ? 'D' : t === 'D' ? 'N' : t === 'N' ? 'E' : t === 'E' ? 'F' : null;
