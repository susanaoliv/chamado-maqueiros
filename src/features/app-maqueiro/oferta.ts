/** Segundos que faltam para a oferta expirar (nunca negativo). */
export function segundosRestantes(expiraEm: string, agora: Date) {
  return Math.max(0, Math.ceil((new Date(expiraEm).getTime() - agora.getTime()) / 1000));
}

/** Texto curto do andamento da distribuição para a Central. */
export function resumoDespacho(
  ofertas: { status: string; maqueiro_nome: string; expira_em: string; justificativa: string | null; urgente: boolean }[],
  esgotadoEm: string | null,
  agora: Date,
) {
  const pendentes = ofertas.filter((o) => o.status === 'pendente' && segundosRestantes(o.expira_em, agora) > 0);
  const recusas = ofertas.filter((o) => o.status === 'recusada');
  const expiradas = ofertas.filter((o) => o.status === 'expirada');
  let principal: string | null = null;
  if (pendentes.length > 1) principal = `📱 Oferecido a ${pendentes.length} maqueiros (urgente) · ${segundosRestantes(pendentes[0].expira_em, agora)}s`;
  else if (pendentes.length === 1) principal = `📱 Oferecido a ${pendentes[0].maqueiro_nome} · ${segundosRestantes(pendentes[0].expira_em, agora)}s`;
  return {
    principal,
    esgotado: !pendentes.length && !!esgotadoEm,
    recusas: recusas.map((o) => `${o.maqueiro_nome}: ${o.justificativa}`),
    expiradas: expiradas.map((o) => o.maqueiro_nome),
  };
}
