// Cálculo de indicadores a partir das linhas de vw_chamados_metricas.
// Regras: cancelados não entram nos tempos médios, mas entram nos indicadores de ineficiência.
import type { ChamadoMetrica } from '@/types/database';
import { grupoMotivo } from './constantes';

export type LinhaMetrica = Pick<
  ChamadoMetrica,
  | 'id'
  | 'status'
  | 'aberto_em'
  | 'data_local'
  | 'hora'
  | 'dia_semana'
  | 'turno'
  | 'tipo'
  | 'setor_origem_nome'
  | 'setor_destino_nome'
  | 'maqueiro_nome'
  | 'origem_chamado'
  | 'recurso'
  | 'precisa_isolamento'
  | 'precisa_oxigenio'
  | 'min_acionamento'
  | 'min_acionamento_atendimento'
  | 'min_total'
  | 'motivo_atraso'
  | 'solicitante'
>;

export const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export function percentil(v: number[], p: number) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
export const mediana = (v: number[]) => percentil(v, 50);

const num = (x: number | string | null | undefined) => (x === null || x === undefined ? null : Number(x));

export function ehAtrasado(c: LinhaMetrica, sla: number) {
  const t = num(c.min_total);
  return c.status === 'concluido' && t !== null && t > sla;
}

export function resumo(linhas: LinhaMetrica[], sla: number, metaAcionamento: number) {
  const validos = linhas.filter((c) => c.status !== 'cancelado');
  const concluidos = linhas.filter((c) => c.status === 'concluido');
  const cancelados = linhas.filter((c) => c.status === 'cancelado');
  const totais = concluidos.map((c) => num(c.min_total)).filter((x): x is number => x !== null);
  const acion = validos.map((c) => num(c.min_acionamento)).filter((x): x is number => x !== null);
  const acionAtend = validos.map((c) => num(c.min_acionamento_atendimento)).filter((x): x is number => x !== null);
  const atrasados = concluidos.filter((c) => ehAtrasado(c, sla));
  const dias = new Set(linhas.map((c) => c.data_local)).size;
  const acimaMeta = acion.filter((x) => x > metaAcionamento).length;
  return {
    total: linhas.length,
    validos: validos.length,
    concluidos: concluidos.length,
    cancelados: cancelados.length,
    pctCancelados: linhas.length ? (cancelados.length / linhas.length) * 100 : null,
    abertos: validos.length - concluidos.length,
    aguardandoMaqueiro: linhas.filter((c) => c.status === 'aguardando_maqueiro').length,
    atrasados: atrasados.length,
    noPrazo: concluidos.length - atrasados.length,
    pctNoPrazo: concluidos.length ? ((concluidos.length - atrasados.length) / concluidos.length) * 100 : null,
    tempoMedio: media(totais),
    mediana: mediana(totais),
    p90: percentil(totais, 90),
    maior: totais.length ? Math.max(...totais) : null,
    acionamentoMedio: media(acion),
    acionamentoAtendimentoMedio: media(acionAtend),
    acimaMetaAcionamento: acimaMeta,
    pctAcimaMetaAcionamento: acion.length ? (acimaMeta / acion.length) * 100 : null,
    minutosPerdidos: totais.reduce((s, t) => s + Math.max(0, t - sla), 0),
    atrasosSemJustificativa: atrasados.filter((c) => !c.motivo_atraso).length,
    dias,
    mediaDia: dias ? linhas.length / dias : null,
  };
}
export type Resumo = ReturnType<typeof resumo>;

export type Grupo = {
  chave: string;
  total: number;
  concluidos: number;
  cancelados: number;
  atrasados: number;
  tempoMedio: number | null;
  acionamentoMedio: number | null;
  minutosAtendimento: number;
  pctNoPrazo: number | null;
};

export function agrupar(linhas: LinhaMetrica[], chave: (c: LinhaMetrica) => string | null | undefined, sla: number): Grupo[] {
  const mapa = new Map<string, LinhaMetrica[]>();
  for (const c of linhas) {
    const k = chave(c);
    if (k === null || k === undefined || k === '') continue;
    const arr = mapa.get(k) ?? [];
    arr.push(c);
    mapa.set(k, arr);
  }
  return [...mapa.entries()]
    .map(([k, arr]) => {
      const concl = arr.filter((c) => c.status === 'concluido');
      const tot = concl.map((c) => num(c.min_total)).filter((x): x is number => x !== null);
      const acion = arr
        .filter((c) => c.status !== 'cancelado')
        .map((c) => num(c.min_acionamento))
        .filter((x): x is number => x !== null);
      const atr = concl.filter((c) => ehAtrasado(c, sla)).length;
      return {
        chave: k,
        total: arr.length,
        concluidos: concl.length,
        cancelados: arr.filter((c) => c.status === 'cancelado').length,
        atrasados: atr,
        tempoMedio: media(tot),
        acionamentoMedio: media(acion),
        minutosAtendimento: tot.reduce((a, b) => a + b, 0),
        pctNoPrazo: concl.length ? ((concl.length - atr) / concl.length) * 100 : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function porHora(linhas: LinhaMetrica[], sla: number) {
  const g = new Map(agrupar(linhas, (c) => String(c.hora), sla).map((x) => [Number(x.chave), x]));
  return Array.from({ length: 24 }, (_, h) => ({ hora: h, rotulo: `${String(h).padStart(2, '0')}h`, ...(g.get(h) ?? vazio(String(h))) }));
}

function vazio(chave: string): Grupo {
  return { chave, total: 0, concluidos: 0, cancelados: 0, atrasados: 0, tempoMedio: null, acionamentoMedio: null, minutosAtendimento: 0, pctNoPrazo: null };
}

/** Mapa de calor dia da semana (0=dom) × hora. */
export function mapaCalor(linhas: LinhaMetrica[]) {
  const m: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of linhas) m[c.dia_semana][c.hora]++;
  const max = Math.max(0, ...m.flat());
  const horasComMovimento = Array.from({ length: 24 }, (_, h) => h).filter((h) => m.some((d) => d[h] > 0));
  return { matriz: m, max, horas: horasComMovimento };
}

export function necessidades(linhas: LinhaMetrica[]) {
  const v = linhas.filter((c) => c.status !== 'cancelado');
  return [
    { chave: 'Isolamento', total: v.filter((c) => c.precisa_isolamento).length },
    { chave: 'Oxigênio', total: v.filter((c) => c.precisa_oxigenio).length },
    { chave: 'Maca', total: v.filter((c) => c.recurso === 'Maca').length },
    { chave: 'Cadeira de rodas', total: v.filter((c) => c.recurso === 'Cadeira de rodas').length },
    { chave: 'Cama', total: v.filter((c) => c.recurso === 'Cama').length },
    { chave: 'Só acompanhamento', total: v.filter((c) => c.recurso === 'Só acompanhamento').length },
  ];
}

export function motivosAtraso(linhas: LinhaMetrica[], sla: number) {
  const atrasados = linhas.filter((c) => ehAtrasado(c, sla));
  const total = atrasados.length;
  const mapa = new Map<string, { qtd: number; minutos: number }>();
  for (const c of atrasados) {
    const k = c.motivo_atraso ?? 'Sem justificativa';
    const x = mapa.get(k) ?? { qtd: 0, minutos: 0 };
    x.qtd++;
    x.minutos += Math.max(0, (num(c.min_total) ?? 0) - sla);
    mapa.set(k, x);
  }
  return [...mapa.entries()]
    .map(([motivo, x]) => ({ motivo, grupo: grupoMotivo(motivo === 'Sem justificativa' ? null : motivo) ?? 'Sem justificativa', qtd: x.qtd, pct: total ? (x.qtd / total) * 100 : 0, minutos: x.minutos }))
    .sort((a, b) => b.qtd - a.qtd);
}

export function gruposAtraso(linhas: LinhaMetrica[], sla: number) {
  const mapa = new Map<string, number>();
  for (const m of motivosAtraso(linhas, sla)) mapa.set(m.grupo, (mapa.get(m.grupo) ?? 0) + m.qtd);
  return [...mapa.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
}

export const topN = <T>(arr: T[], n = 8) => arr.slice(0, n);

/** Pior faixa horária: hora com maior % de atraso (mínimo 3 chamados concluídos) ou maior volume. */
export function piorFaixa(linhas: LinhaMetrica[], sla: number) {
  const horas = porHora(linhas, sla).filter((h) => h.concluidos >= 3);
  if (!horas.length) return null;
  return horas.reduce((pior, h) => (h.atrasados / h.concluidos > pior.atrasados / pior.concluidos ? h : pior));
}

export const pct = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(casas).replace('.', ',')}%`;

export const corPrazo = (p: number | null) =>
  p === null ? 'slate' : p >= 90 ? 'green' : p >= 75 ? 'orange' : 'red';

// ----------------------------------------------------------------------------
// Intervalos dos maqueiros
// ----------------------------------------------------------------------------
export type LinhaIntervalo = { maqueiro_nome: string; minutos: number; hora: number; data_local: string; em_andamento: boolean };

export function resumoIntervalos(linhas: LinhaIntervalo[]) {
  const min = linhas.map((l) => Number(l.minutos));
  const dias = new Set(linhas.map((l) => l.data_local)).size;
  return {
    total: linhas.length,
    emAndamento: linhas.filter((l) => l.em_andamento).length,
    minutosTotais: min.reduce((a, b) => a + b, 0),
    media: media(min),
    mediana: mediana(min),
    maior: min.length ? Math.max(...min) : null,
    dias,
  };
}

export function intervalosPorMaqueiro(linhas: LinhaIntervalo[]) {
  const mapa = new Map<string, number[]>();
  for (const l of linhas) mapa.set(l.maqueiro_nome, [...(mapa.get(l.maqueiro_nome) ?? []), Number(l.minutos)]);
  return [...mapa.entries()]
    .map(([chave, v]) => ({ chave, qtd: v.length, minutos: v.reduce((a, b) => a + b, 0), media: media(v) ?? 0, maior: Math.max(...v) }))
    .sort((a, b) => b.minutos - a.minutos);
}

export function intervalosPorHora(linhas: LinhaIntervalo[]) {
  const qtd = Array(24).fill(0);
  for (const l of linhas) qtd[l.hora]++;
  return qtd.map((total, h) => ({ hora: h, rotulo: `${String(h).padStart(2, '0')}h`, total }));
}

// ----------------------------------------------------------------------------
// App dos maqueiros: ofertas e jornadas
// ----------------------------------------------------------------------------
export type LinhaOferta = { status: string; maqueiro_nome: string; justificativa: string | null; segundos_resposta: number | null; urgente: boolean };

export function resumoOfertas(linhas: LinhaOferta[]) {
  const validas = linhas.filter((o) => o.status !== 'cancelada' && o.status !== 'pendente');
  const aceitas = linhas.filter((o) => o.status === 'aceita');
  const tempos = aceitas.map((o) => Number(o.segundos_resposta)).filter((x) => !Number.isNaN(x));
  return {
    enviadas: linhas.length,
    aceitas: aceitas.length,
    recusadas: linhas.filter((o) => o.status === 'recusada').length,
    expiradas: linhas.filter((o) => o.status === 'expirada').length,
    pctAceite: validas.length ? (aceitas.length / validas.length) * 100 : null,
    segundosAceiteMedio: media(tempos),
  };
}

/** Recusas e não-respostas por maqueiro (mais primeiro). */
export function ofertasPorMaqueiro(linhas: LinhaOferta[]) {
  const mapa = new Map<string, { aceitas: number; recusadas: number; expiradas: number }>();
  for (const o of linhas) {
    const x = mapa.get(o.maqueiro_nome) ?? { aceitas: 0, recusadas: 0, expiradas: 0 };
    if (o.status === 'aceita') x.aceitas++;
    if (o.status === 'recusada') x.recusadas++;
    if (o.status === 'expirada') x.expiradas++;
    mapa.set(o.maqueiro_nome, x);
  }
  return [...mapa.entries()].map(([chave, x]) => ({ chave, ...x })).sort((a, b) => b.recusadas + b.expiradas - (a.recusadas + a.expiradas));
}

/** Motivo de recusa: a parte antes de ":" (o app grava "Motivo: detalhe"). */
export function motivosRecusa(linhas: LinhaOferta[]) {
  const mapa = new Map<string, number>();
  for (const o of linhas.filter((l) => l.status === 'recusada')) {
    const k = (o.justificativa ?? 'Sem motivo').split(':')[0].trim() || 'Sem motivo';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
}

export function horasJornadaPorMaqueiro(linhas: { maqueiro_nome: string; horas: number }[]) {
  const mapa = new Map<string, number>();
  for (const j of linhas) mapa.set(j.maqueiro_nome, (mapa.get(j.maqueiro_nome) ?? 0) + Number(j.horas));
  return [...mapa.entries()].map(([chave, total]) => ({ chave, total: Math.round(total * 10) / 10 })).sort((a, b) => b.total - a.total);
}
