import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import { TZ } from './constantes';

// Diferença entre o relógio do servidor e o do computador (ms). Atualizada ao logar
// e periodicamente; os cronômetros da tela usam agora() em vez de Date.now().
let offsetMs = 0;
export function definirOffsetServidor(servidorIso: string, enviadoEm: number, recebidoEm: number) {
  const meio = (enviadoEm + recebidoEm) / 2;
  offsetMs = new Date(servidorIso).getTime() - meio;
}
export const agora = () => new Date(Date.now() + offsetMs);

export const fmtHora = (d: string | Date | null | undefined) => (d ? formatInTimeZone(d, TZ, 'HH:mm') : '—');
export const fmtDataHora = (d: string | Date | null | undefined) => (d ? formatInTimeZone(d, TZ, 'dd/MM/yyyy HH:mm') : '—');
export const fmtData = (d: string | Date | null | undefined) => (d ? formatInTimeZone(d, TZ, 'dd/MM/yyyy') : '—');
export const fmtDataExtenso = (d: Date) => formatInTimeZone(d, TZ, "EEEE, d 'de' MMMM", { locale: ptBR });

/** Data local (Fortaleza) no formato yyyy-MM-dd. */
export const hojeLocal = (base: Date = agora()) => formatInTimeZone(base, TZ, 'yyyy-MM-dd');

/** Converte "yyyy-MM-dd" + "HH:mm" (hora local de Fortaleza) para ISO UTC. */
export const localParaIso = (data: string, hora = '00:00') => fromZonedTime(`${data}T${hora}:00`, TZ).toISOString();

/** Converte ISO para o valor de um <input type="datetime-local"> em hora de Fortaleza. */
export const isoParaInputLocal = (iso: string | null | undefined) =>
  iso ? formatInTimeZone(iso, TZ, "yyyy-MM-dd'T'HH:mm") : '';

/** Converte valor de <input type="datetime-local"> (interpretado em Fortaleza) para ISO. */
export const inputLocalParaIso = (v: string) => (v ? fromZonedTime(`${v}:00`, TZ).toISOString() : null);

export function minutosEntre(inicio: string | Date | null | undefined, fim: string | Date | null | undefined) {
  if (!inicio || !fim) return null;
  return (new Date(fim).getTime() - new Date(inicio).getTime()) / 60000;
}

export function fmtMin(min: number | null | undefined, casas = 0) {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  return `${min.toFixed(casas).replace('.', ',')} min`;
}

/** "12 min", "1 h 05 min" */
export function fmtDuracao(min: number | null | undefined) {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function intervaloPeriodo(periodo: 'hoje' | '7dias' | 'mes' | 'tudo', base: Date = agora()) {
  const hoje = hojeLocal(base);
  const fimIso = localParaIso(hoje, '23:59');
  const fim = new Date(new Date(fimIso).getTime() + 60000).toISOString();
  if (periodo === 'hoje') return { de: localParaIso(hoje), ate: fim };
  if (periodo === '7dias') {
    const d = new Date(new Date(localParaIso(hoje)).getTime() - 6 * 86400000);
    return { de: d.toISOString(), ate: fim };
  }
  if (periodo === 'mes') return { de: localParaIso(hoje.slice(0, 8) + '01'), ate: fim };
  return { de: '2000-01-01T00:00:00Z', ate: fim };
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
