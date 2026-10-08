import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Abas, Botao, Cartao, Campo, Carregando, Entrada, Erro, Kpi, Tabela } from '@/components/ui';
import { Colunas, Ranking } from '@/components/graficos';
import { useChamadosPeriodo, useConfig } from '@/hooks/dados';
import { supabase } from '@/lib/supabase';
import { exportarCsv, exportarPdf, exportarXlsx, type Secao } from '@/lib/exportar';
import { hojeLocal, localParaIso, fmtMin } from '@/lib/tempo';
import { agrupar, corPrazo, media, pct, porHora, topN } from '@/lib/metricas';
import { mensagemErro } from '@/lib/erros';
import type { CapacidadeHora } from '@/types/database';
import { MapaCalor } from '@/features/dashboard/DashboardPage';
import {
  secaoAtrasosDetalhe,
  secaoCancelados,
  secaoCapacidade,
  secaoListaChamados,
  secaoMapaCalor,
  secoesSla,
  secoesTabelas,
} from './secoes';

type Modo = 'periodo' | 'diario' | 'mensal';

const addDia = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtD = (iso: string) => iso.split('-').reverse().join('/');

function diasEntre(de: string, ate: string) {
  const r: string[] = [];
  for (let d = de; d <= ate && r.length < 400; d = addDia(d, 1)) r.push(d);
  return r;
}

export function RelatoriosPage() {
  const hoje = hojeLocal();
  const [modo, setModo] = useState<Modo>('periodo');
  const [de, setDe] = useState(hoje.slice(0, 8) + '01');
  const [ate, setAte] = useState(hoje);
  const [dia, setDia] = useState(hoje);
  const [mes, setMes] = useState(hoje.slice(0, 7));

  // Intervalo efetivo conforme o modo
  const [ini, fim] = useMemo(() => {
    if (modo === 'diario') return [dia, dia];
    if (modo === 'mensal') {
      const [a, m] = mes.split('-').map(Number);
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`];
    }
    return de <= ate ? [de, ate] : [ate, de];
  }, [modo, dia, mes, de, ate]);

  const { data: linhas, isLoading, error } = useChamadosPeriodo(localParaIso(ini), localParaIso(addDia(fim, 1)));
  const { data: config } = useConfig();
  const sla = config?.sla ?? 20;
  const meta = config?.metaAcionamento ?? 5;

  // Capacidade dia a dia (até 62 dias) para "horas com demanda > capacidade"
  const dias = useMemo(() => diasEntre(ini, fim), [ini, fim]);
  const capQueries = useQueries({
    queries: (dias.length <= 62 ? dias : []).map((d) => ({
      queryKey: ['capacidade', d],
      queryFn: async () => {
        const { data, error: e } = await supabase.rpc('capacidade_dia', { p_data: d });
        if (e) throw e;
        return (data ?? []) as CapacidadeHora[];
      },
      staleTime: 60_000,
    })),
  });
  const capProntas = dias.length <= 62 && capQueries.every((q) => q.data);
  const horasDeficit = capProntas ? capQueries.reduce((s, q) => s + (q.data ?? []).filter((h) => h.deficit).length, 0) : null;

  const capDia = modo === 'diario' ? capQueries[0]?.data : undefined;
  const montado = useMemo(() => {
    if (!linhas) return null;
    const sla_ = secoesSla(linhas, sla, meta, horasDeficit);
    const t = secoesTabelas(linhas, sla);
    let secoes: Secao[];
    if (modo === 'diario') {
      const cap = capDia;
      secoes = [sla_.resumoSla, t.porHora, t.porSetor, t.porTipo, t.porMaqueiro, secaoAtrasosDetalhe(linhas, sla), secaoCancelados(linhas), ...(cap ? [secaoCapacidade(cap)] : []), secaoListaChamados(linhas)];
    } else if (modo === 'mensal') {
      secoes = [sla_.resumoSla, sla_.inef, t.porDia, t.porTurno, t.porSetor, t.porHora, t.porMaqueiro, sla_.motivos, t.gruposAtraso, secaoMapaCalor(linhas), secaoCancelados(linhas)];
    } else {
      secoes = [sla_.resumoSla, sla_.inef, t.porDia, t.porTurno, t.porHora, t.porMaqueiro, sla_.motivos, secaoListaChamados(linhas)];
    }
    return { ...sla_, t, secoes };
  }, [linhas, sla, meta, horasDeficit, modo, capDia]);

  const titulo = modo === 'diario' ? `Relatório diário · ${fmtD(ini)}` : modo === 'mensal' ? `Relatório mensal · ${mes.split('-').reverse().join('/')}` : `Relatório · ${fmtD(ini)} a ${fmtD(fim)}`;
  const nomeArquivo = `maqueiros_${modo}_${ini}${ini !== fim ? `_a_${fim}` : ''}`;
  const [exportando, setExportando] = useState<string | null>(null);
  const exportar = async (tipo: 'xlsx' | 'csv' | 'pdf') => {
    if (!montado) return;
    setExportando(tipo);
    try {
      if (tipo === 'csv') exportarCsv(nomeArquivo, montado.secoes);
      if (tipo === 'xlsx') await exportarXlsx(nomeArquivo, montado.secoes);
      if (tipo === 'pdf') await exportarPdf(nomeArquivo, `Chamados de Maqueiros · ${titulo}`, `SLA ${sla} min · meta de acionamento ${meta} min · gerado em ${new Date().toLocaleString('pt-BR')}`, montado.secoes.filter((s) => s.titulo !== 'Chamados'));
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Relatórios</h1>
        <Abas
          abas={[
            { id: 'periodo', rotulo: 'Período' },
            { id: 'diario', rotulo: 'Diário' },
            { id: 'mensal', rotulo: 'Mensal' },
          ]}
          ativa={modo}
          onChange={setModo}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {modo === 'periodo' && (
          <>
            <Campo rotulo="De" htmlFor="rel_de">
              <Entrada id="rel_de" type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
            </Campo>
            <Campo rotulo="Até" htmlFor="rel_ate">
              <Entrada id="rel_ate" type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
            </Campo>
          </>
        )}
        {modo === 'diario' && (
          <Campo rotulo="Dia" htmlFor="rel_dia">
            <Entrada id="rel_dia" type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
          </Campo>
        )}
        {modo === 'mensal' && (
          <Campo rotulo="Mês" htmlFor="rel_mes">
            <Entrada id="rel_mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
          </Campo>
        )}
        <div className="ml-auto flex gap-2">
          <Botao variante="secundario" onClick={() => exportar('xlsx')} carregando={exportando === 'xlsx'} disabled={!montado}>
            Excel
          </Botao>
          <Botao variante="secundario" onClick={() => exportar('csv')} carregando={exportando === 'csv'} disabled={!montado}>
            CSV
          </Botao>
          <Botao variante="secundario" onClick={() => exportar('pdf')} carregando={exportando === 'pdf'} disabled={!montado}>
            PDF
          </Botao>
        </div>
      </div>

      {isLoading ? (
        <Carregando />
      ) : error ? (
        <Erro erro={error} />
      ) : montado && linhas ? (
        <>
          <h2 className="text-lg font-bold">{titulo}</h2>
          {modo === 'mensal' && <ResumoExecutivo r={montado.resumo} linhas={linhas} sla={sla} />}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi titulo="Chamados" valor={montado.resumo.total} detalhe={`${montado.resumo.concluidos} concluídos`} />
            <Kpi titulo="No prazo" valor={pct(montado.resumo.pctNoPrazo)} cor={corPrazo(montado.resumo.pctNoPrazo)} />
            <Kpi titulo="Tempo médio" valor={fmtMin(montado.resumo.tempoMedio)} detalhe={`P90 ${fmtMin(montado.resumo.p90)}`} cor="purple" />
            <Kpi titulo="Cancelados" valor={montado.resumo.cancelados} detalhe={pct(montado.resumo.pctCancelados, 1)} cor="slate" />
          </div>
          {modo !== 'periodo' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Cartao titulo="Chamados por hora">
                <Colunas dados={porHora(linhas, sla)} x="rotulo" y="total" />
              </Cartao>
              <Cartao titulo="Setores que mais solicitam">
                <Ranking dados={topN(agrupar(linhas, (c) => c.setor_origem_nome, sla)).map((g) => ({ chave: g.chave, total: g.total }))} />
              </Cartao>
              {modo === 'mensal' && (
                <Cartao titulo="Mapa de calor" className="lg:col-span-2">
                  <MapaCalor linhas={linhas} />
                </Cartao>
              )}
            </div>
          )}
          {montado.secoes.map((s) => (
            <TabelaSecao key={s.titulo} secao={s} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function ResumoExecutivo({ r, linhas, sla }: { r: ReturnType<typeof secoesSla>['resumo']; linhas: NonNullable<ReturnType<typeof useChamadosPeriodo>['data']>; sla: number }) {
  const porMaq = agrupar(linhas.filter((c) => c.maqueiro_nome), (c) => c.maqueiro_nome, sla);
  const pico = porHora(linhas, sla).reduce((a, b) => (b.total > a.total ? b : a), { total: -1, rotulo: '—' } as { total: number; rotulo: string });
  const setor = agrupar(linhas, (c) => c.setor_origem_nome, sla)[0];
  return (
    <Cartao titulo="Resumo executivo">
      <p className="text-sm leading-relaxed">
        No mês foram registrados <strong>{r.total}</strong> chamados (média de <strong>{r.mediaDia?.toFixed(1).replace('.', ',') ?? '—'}</strong> por dia e{' '}
        <strong>{media(porMaq.map((g) => g.total))?.toFixed(1).replace('.', ',') ?? '—'}</strong> por maqueiro). <strong>{pct(r.pctNoPrazo, 1)}</strong> dos concluídos ficaram
        dentro do prazo de {sla} min; {r.atrasados} atrasaram, somando {Math.round(r.minutosPerdidos)} minutos acima do SLA. O tempo médio foi de {fmtMin(r.tempoMedio, 1)} (mediana{' '}
        {fmtMin(r.mediana, 1)}) e o acionamento médio, {fmtMin(r.acionamentoMedio, 1)}. O horário de pico foi <strong>{pico.rotulo}</strong>
        {setor && (
          <>
            {' '}
            e o setor que mais solicitou foi <strong>{setor.chave}</strong> ({setor.total})
          </>
        )}
        . Houve {r.cancelados} cancelamento(s) ({pct(r.pctCancelados, 1)}).
      </p>
    </Cartao>
  );
}

function TabelaSecao({ secao }: { secao: Secao }) {
  const [todas, setTodas] = useState(false);
  const limite = 50;
  const visiveis = todas ? secao.linhas : secao.linhas.slice(0, limite);
  return (
    <Cartao titulo={`${secao.titulo}${secao.linhas.length > limite ? ` (${secao.linhas.length})` : ''}`}>
      {secao.linhas.length === 0 ? (
        <p className="text-sm text-slate-500">Sem registros.</p>
      ) : (
        <>
          <Tabela>
            <thead>
              <tr>
                {secao.colunas.map((c) => (
                  <th key={c.titulo}>{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr key={i}>
                  {secao.colunas.map((c) => (
                    <td key={c.titulo} className="whitespace-nowrap">
                      {String(c.valor(l) ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Tabela>
          {secao.linhas.length > limite && (
            <button className="mt-2 text-sm text-marca-600 underline" onClick={() => setTodas(!todas)}>
              {todas ? 'Mostrar menos' : `Mostrar todas as ${secao.linhas.length} linhas`}
            </button>
          )}
        </>
      )}
    </Cartao>
  );
}
