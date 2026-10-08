// Monta as seções dos relatórios. As mesmas seções são exibidas na tela e exportadas
// (Excel, CSV e PDF), garantindo que os arquivos conferem com o que se vê.
import type { Secao } from '@/lib/exportar';
import { n1 } from '@/lib/exportar';
import { agrupar, gruposAtraso, mapaCalor, motivosAtraso, pct, piorFaixa, porHora, resumo, type Grupo, type LinhaMetrica } from '@/lib/metricas';
import { DIAS_SEMANA, fmtDataHora, fmtMin } from '@/lib/tempo';
import type { CapacidadeHora, ChamadoMetrica } from '@/types/database';

type Ind = { indicador: string; valor: string | number };
const secInd = (titulo: string, linhas: Ind[]): Secao<Ind> => ({
  titulo,
  colunas: [
    { titulo: 'Indicador', valor: (l) => l.indicador },
    { titulo: 'Valor', valor: (l) => l.valor },
  ],
  linhas,
});

const colsGrupo = (rotulo: string, extra?: 'minutos'): Secao<Grupo>['colunas'] => [
  { titulo: rotulo, valor: (g) => g.chave },
  { titulo: 'Chamados', valor: (g) => g.total },
  { titulo: 'Concluídos', valor: (g) => g.concluidos },
  { titulo: 'Cancelados', valor: (g) => g.cancelados },
  { titulo: 'Atrasados', valor: (g) => g.atrasados },
  { titulo: '% no prazo', valor: (g) => (g.pctNoPrazo === null ? '' : n1(g.pctNoPrazo)) },
  { titulo: 'Tempo médio (min)', valor: (g) => n1(g.tempoMedio) },
  { titulo: 'Acionamento médio (min)', valor: (g) => n1(g.acionamentoMedio) },
  ...(extra === 'minutos' ? [{ titulo: 'Minutos em atendimento', valor: (g: Grupo) => Math.round(g.minutosAtendimento) }] : []),
];

export function secoesSla(linhas: LinhaMetrica[], sla: number, meta: number, horasDeficit: number | null) {
  const r = resumo(linhas, sla, meta);
  const pior = piorFaixa(linhas, sla);
  const resumoSla = secInd('Resumo de SLA', [
    { indicador: 'Total de chamados', valor: r.total },
    { indicador: 'Concluídos', valor: r.concluidos },
    { indicador: `% no prazo (SLA ${sla} min)`, valor: pct(r.pctNoPrazo, 1) },
    { indicador: 'Atrasados', valor: r.atrasados },
    { indicador: 'Resposta média (abertura → acionamento)', valor: fmtMin(r.acionamentoMedio, 1) },
    { indicador: 'Acionamento → início do atendimento (média)', valor: fmtMin(r.acionamentoAtendimentoMedio, 1) },
    { indicador: 'Tempo médio total', valor: fmtMin(r.tempoMedio, 1) },
    { indicador: 'Mediana', valor: fmtMin(r.mediana, 1) },
    { indicador: 'P90', valor: fmtMin(r.p90, 1) },
    { indicador: 'Maior tempo', valor: fmtMin(r.maior, 1) },
    { indicador: 'Média por dia', valor: r.mediaDia === null ? '—' : r.mediaDia.toFixed(1).replace('.', ',') },
  ]);
  const inef = secInd('Indicadores de ineficiência', [
    { indicador: `Acionamentos acima da meta (${meta} min)`, valor: `${r.acimaMetaAcionamento} (${pct(r.pctAcimaMetaAcionamento, 1)})` },
    { indicador: 'Chamados esperando maqueiro agora', valor: r.aguardandoMaqueiro },
    { indicador: 'Minutos perdidos acima do SLA', valor: Math.round(r.minutosPerdidos) },
    { indicador: 'Atrasos sem justificativa', valor: r.atrasosSemJustificativa },
    { indicador: 'Cancelados', valor: `${r.cancelados} (${pct(r.pctCancelados, 1)})` },
    { indicador: 'Horas com demanda > capacidade', valor: horasDeficit === null ? '— (período longo; veja Capacidade)' : horasDeficit },
    { indicador: 'Pior faixa horária (maior % de atraso)', valor: pior ? `${String(pior.hora).padStart(2, '0')}h (${pior.atrasados}/${pior.concluidos} atrasados)` : '—' },
  ]);
  const motivos: Secao<ReturnType<typeof motivosAtraso>[number]> = {
    titulo: 'Motivos de atraso',
    colunas: [
      { titulo: 'Motivo', valor: (m) => m.motivo },
      { titulo: 'Grupo', valor: (m) => m.grupo },
      { titulo: 'Qtd', valor: (m) => m.qtd },
      { titulo: '%', valor: (m) => n1(m.pct) },
      { titulo: 'Minutos perdidos', valor: (m) => Math.round(m.minutos) },
    ],
    linhas: motivosAtraso(linhas, sla),
  };
  return { resumo: r, resumoSla, inef, motivos };
}

export function secoesTabelas(linhas: LinhaMetrica[], sla: number) {
  return {
    porDia: {
      titulo: 'Por dia',
      colunas: colsGrupo('Dia'),
      linhas: agrupar(linhas, (c) => c.data_local, sla)
        .sort((a, b) => a.chave.localeCompare(b.chave))
        .map((g) => ({ ...g, chave: g.chave.split('-').reverse().join('/') })),
    } as Secao<Grupo>,
    porTurno: { titulo: 'Por turno (diurno 7–19h / noturno)', colunas: colsGrupo('Turno'), linhas: agrupar(linhas, (c) => c.turno, sla) } as Secao<Grupo>,
    porHora: {
      titulo: 'Por hora',
      colunas: colsGrupo('Hora'),
      linhas: porHora(linhas, sla).filter((h) => h.total > 0).map((h) => ({ ...h, chave: h.rotulo })),
    } as Secao<Grupo>,
    porMaqueiro: { titulo: 'Por maqueiro', colunas: colsGrupo('Maqueiro', 'minutos'), linhas: agrupar(linhas, (c) => c.maqueiro_nome ?? 'Sem maqueiro', sla) } as Secao<Grupo>,
    porSetor: { titulo: 'Por setor solicitante', colunas: colsGrupo('Setor'), linhas: agrupar(linhas, (c) => c.setor_origem_nome, sla) } as Secao<Grupo>,
    porDestino: { titulo: 'Por destino', colunas: colsGrupo('Destino'), linhas: agrupar(linhas, (c) => c.setor_destino_nome ?? 'Sem destino (alta)', sla) } as Secao<Grupo>,
    porTipo: { titulo: 'Por tipo', colunas: colsGrupo('Tipo'), linhas: agrupar(linhas, (c) => c.tipo, sla) } as Secao<Grupo>,
    gruposAtraso: {
      titulo: 'Causas de atraso agrupadas',
      colunas: [
        { titulo: 'Causa', valor: (g) => g.chave },
        { titulo: 'Qtd', valor: (g) => g.total },
      ],
      linhas: gruposAtraso(linhas, sla),
    } as Secao<{ chave: string; total: number }>,
  };
}

export function secaoAtrasosDetalhe(linhas: ChamadoMetrica[], sla: number): Secao<ChamadoMetrica> {
  return {
    titulo: 'Chamados atrasados e justificativas',
    colunas: [
      { titulo: 'Número', valor: (c) => c.numero },
      { titulo: 'Abertura', valor: (c) => fmtDataHora(c.aberto_em) },
      { titulo: 'Origem → destino', valor: (c) => `${c.setor_origem_nome} → ${c.setor_destino_nome ?? '—'}` },
      { titulo: 'Maqueiro', valor: (c) => c.maqueiro_nome ?? '' },
      { titulo: 'Tempo (min)', valor: (c) => n1(c.min_total === null ? null : Number(c.min_total)) },
      { titulo: 'Motivo', valor: (c) => c.motivo_atraso ?? 'Sem justificativa' },
      { titulo: 'Descrição', valor: (c) => c.motivo_atraso_texto ?? '' },
    ],
    linhas: linhas.filter((c) => c.status === 'concluido' && Number(c.min_total) > sla),
  };
}

export function secaoCancelados(linhas: ChamadoMetrica[]): Secao<ChamadoMetrica> {
  return {
    titulo: 'Cancelados',
    colunas: [
      { titulo: 'Número', valor: (c) => c.numero },
      { titulo: 'Abertura', valor: (c) => fmtDataHora(c.aberto_em) },
      { titulo: 'Setor', valor: (c) => c.setor_origem_nome },
      { titulo: 'Cancelado por', valor: (c) => c.cancelado_por ?? '' },
      { titulo: 'Justificativa', valor: (c) => c.cancelado_motivo ?? '' },
    ],
    linhas: linhas.filter((c) => c.status === 'cancelado'),
  };
}

export function secaoCapacidade(horas: CapacidadeHora[]): Secao<CapacidadeHora> {
  return {
    titulo: 'Simultâneos × maqueiros disponíveis',
    colunas: [
      { titulo: 'Hora', valor: (h) => `${String(h.hora).padStart(2, '0')}h` },
      { titulo: 'Maqueiros disponíveis', valor: (h) => h.capacidade },
      { titulo: 'Chamados abertos', valor: (h) => h.chamados_abertos },
      { titulo: 'Pico simultâneo', valor: (h) => h.demanda_pico },
      { titulo: 'Demanda > capacidade', valor: (h) => (h.deficit ? 'SIM' : '') },
    ],
    linhas: horas,
  };
}

export function secaoMapaCalor(linhas: LinhaMetrica[]): Secao<{ dia: string; valores: number[] }> {
  const { matriz } = mapaCalor(linhas);
  return {
    titulo: 'Mapa de calor (dia da semana × hora)',
    colunas: [{ titulo: 'Dia', valor: (l) => l.dia }, ...Array.from({ length: 24 }, (_, h) => ({ titulo: `${String(h).padStart(2, '0')}h`, valor: (l: { valores: number[] }) => l.valores[h] || '' }))],
    linhas: matriz.map((v, d) => ({ dia: DIAS_SEMANA[d], valores: v })),
  };
}

export function secaoListaChamados(linhas: ChamadoMetrica[]): Secao<ChamadoMetrica> {
  return {
    titulo: 'Chamados',
    colunas: [
      { titulo: 'Número', valor: (c) => c.numero },
      { titulo: 'Abertura', valor: (c) => fmtDataHora(c.aberto_em) },
      { titulo: 'Tipo', valor: (c) => c.tipo },
      { titulo: 'Origem', valor: (c) => c.setor_origem_nome },
      { titulo: 'Leito origem', valor: (c) => c.leito_origem ?? '' },
      { titulo: 'Destino', valor: (c) => c.setor_destino_nome ?? '' },
      { titulo: 'Leito destino', valor: (c) => c.leito_destino ?? '' },
      { titulo: 'Prioridade', valor: (c) => c.prioridade },
      { titulo: 'Recurso', valor: (c) => c.recurso },
      { titulo: 'Origem do chamado', valor: (c) => c.origem_chamado },
      { titulo: 'Solicitante', valor: (c) => c.solicitante ?? '' },
      { titulo: 'Status', valor: (c) => c.status },
      { titulo: 'Maqueiro', valor: (c) => c.maqueiro_nome ?? '' },
      { titulo: 'Acionamento', valor: (c) => fmtDataHora(c.maqueiro_informado_em) },
      { titulo: 'Término', valor: (c) => fmtDataHora(c.encerrado_em) },
      { titulo: 'Min. acionamento', valor: (c) => n1(c.min_acionamento === null ? null : Number(c.min_acionamento)) },
      { titulo: 'Min. total', valor: (c) => n1(c.min_total === null ? null : Number(c.min_total)) },
      { titulo: 'Motivo atraso', valor: (c) => c.motivo_atraso ?? '' },
      { titulo: 'Criado por', valor: (c) => c.criado_por ?? '' },
      { titulo: 'Encerrado por', valor: (c) => c.encerrado_por ?? '' },
    ],
    linhas,
  };
}
