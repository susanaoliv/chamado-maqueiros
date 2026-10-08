import { useMemo, useState } from 'react';
import { Abas, Cartao, Carregando, Erro, Kpi, Selecao } from '@/components/ui';
import { Colunas, Ranking, Rosca, comOutros, useCores } from '@/components/graficos';
import { useChamadosPeriodo, useConfig, useIntervalosPeriodo, useMaqueiros, useSetores } from '@/hooks/dados';
import { intervaloPeriodo, fmtMin, fmtDuracao, fmtDataHora, DIAS_SEMANA } from '@/lib/tempo';
import {
  agrupar, corPrazo, gruposAtraso, intervalosPorHora, intervalosPorMaqueiro, mapaCalor, media, motivosAtraso, necessidades, pct, porHora, resumo,
  resumoIntervalos, topN, type LinhaMetrica,
} from '@/lib/metricas';
import { Tabela } from '@/components/ui';
import { TIPOS_CHAMADO } from '@/lib/constantes';

type Periodo = 'hoje' | '7dias' | 'mes' | 'tudo';

export type Filtros = { turno: string; setor: string; destino: string; tipo: string; maqueiro: string };
export const FILTROS_VAZIOS: Filtros = { turno: '', setor: '', destino: '', tipo: '', maqueiro: '' };

export function aplicarFiltros<T extends LinhaMetrica>(linhas: T[], f: Filtros) {
  return linhas.filter(
    (c) =>
      (!f.turno || c.turno === f.turno) &&
      (!f.setor || c.setor_origem_nome === f.setor) &&
      (!f.destino || c.setor_destino_nome === f.destino) &&
      (!f.tipo || c.tipo === f.tipo) &&
      (!f.maqueiro || c.maqueiro_nome === f.maqueiro),
  );
}

export function MaisFiltros({ f, setF }: { f: Filtros; setF: (f: Filtros) => void }) {
  const { data: setores = [] } = useSetores();
  const { data: maqueiros = [] } = useMaqueiros(true);
  const ativos = Object.values(f).filter(Boolean).length;
  const sel = (k: keyof Filtros, rotulo: string, opcoes: string[]) => (
    <Selecao aria-label={rotulo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="!py-1.5 text-sm">
      <option value="">{rotulo}: todos</option>
      {opcoes.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </Selecao>
  );
  return (
    <details className="rounded-lg">
      <summary className="cursor-pointer text-sm font-semibold text-marca-600">Mais filtros{ativos ? ` (${ativos})` : ''}</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {sel('turno', 'Turno', ['Diurno', 'Noturno'])}
        {sel('setor', 'Setor', setores.map((s) => s.nome))}
        {sel('destino', 'Destino', setores.map((s) => s.nome))}
        {sel('tipo', 'Tipo', [...TIPOS_CHAMADO])}
        {sel('maqueiro', 'Maqueiro', maqueiros.map((m) => m.nome))}
        <button className="text-sm underline" onClick={() => setF(FILTROS_VAZIOS)}>
          Limpar filtros
        </button>
      </div>
    </details>
  );
}

export function DashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>('7dias');
  const [aba, setAba] = useState<'geral' | 'demanda' | 'equipe' | 'atrasos' | 'intervalos'>('geral');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const { de, ate } = useMemo(() => intervaloPeriodo(periodo), [periodo]);
  const { data, isLoading, error } = useChamadosPeriodo(de, ate);
  const { data: config } = useConfig();
  const sla = config?.sla ?? 20;
  const meta = config?.metaAcionamento ?? 5;
  const cores = useCores();

  const linhas = useMemo(() => aplicarFiltros(data ?? [], filtros), [data, filtros]);
  const r = useMemo(() => resumo(linhas, sla, meta), [linhas, sla, meta]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Abas
          abas={[
            { id: 'hoje', rotulo: 'Hoje' },
            { id: '7dias', rotulo: '7 dias' },
            { id: 'mes', rotulo: 'Mês' },
            { id: 'tudo', rotulo: 'Tudo' },
          ]}
          ativa={periodo}
          onChange={setPeriodo}
        />
      </div>
      <MaisFiltros f={filtros} setF={setFiltros} />

      {isLoading ? (
        <Carregando />
      ) : error ? (
        <Erro erro={error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi titulo="Chamados" valor={r.total} detalhe={r.mediaDia ? `${r.mediaDia.toFixed(1).replace('.', ',')} por dia` : undefined} cor="blue" />
            <Kpi titulo="Dentro do prazo" valor={pct(r.pctNoPrazo)} detalhe={`SLA ${sla} min · ${r.noPrazo} de ${r.concluidos}`} cor={corPrazo(r.pctNoPrazo)} />
            <Kpi titulo="Tempo médio" valor={fmtMin(r.tempoMedio)} detalhe={`mediana ${fmtMin(r.mediana)}`} cor="purple" />
            <Kpi titulo="Tempo de acionamento" valor={fmtMin(r.acionamentoMedio, 1)} detalhe={`meta ${meta} min`} cor="teal" />
            <Kpi titulo="Atrasados" valor={r.atrasados} detalhe={`${r.cancelados} cancelados`} cor={r.atrasados ? 'red' : 'slate'} />
          </div>

          <Abas
            abas={[
              { id: 'geral', rotulo: 'Visão geral' },
              { id: 'demanda', rotulo: 'Demanda' },
              { id: 'equipe', rotulo: 'Equipe' },
              { id: 'atrasos', rotulo: 'Atrasos' },
              { id: 'intervalos', rotulo: 'Intervalos' },
            ]}
            ativa={aba}
            onChange={setAba}
          />

          {aba === 'geral' && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Cartao titulo="Chamados por hora (pico em destaque)" className="lg:col-span-3">
                <Colunas dados={porHora(linhas, sla)} x="rotulo" y="total" />
              </Cartao>
              <Cartao titulo="Prazo (SLA)">
                <Rosca
                  dados={[
                    { chave: 'No prazo', total: r.noPrazo },
                    { chave: 'Atrasados', total: r.atrasados },
                  ]}
                  cores={[cores.bom, cores.ruim]}
                />
              </Cartao>
              <Cartao titulo="Origem do chamado">
                <Rosca dados={agrupar(linhas, (c) => c.origem_chamado, sla).map((g) => ({ chave: g.chave, total: g.total }))} />
              </Cartao>
              <Cartao titulo="Situação">
                <Rosca
                  dados={[
                    { chave: 'Concluídos', total: r.concluidos },
                    { chave: 'Em aberto', total: r.abertos },
                    { chave: 'Cancelados', total: r.cancelados },
                  ]}
                />
              </Cartao>
            </div>
          )}

          {aba === 'demanda' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Cartao titulo="Tipos de chamado">
                <Rosca dados={comOutros(agrupar(linhas, (c) => c.tipo, sla).map((g) => ({ chave: g.chave, total: g.total })))} />
              </Cartao>
              <Cartao titulo="Necessidades especiais">
                <Ranking dados={necessidades(linhas)} />
              </Cartao>
              <Cartao titulo="Setores que mais solicitam">
                <Ranking dados={topN(agrupar(linhas, (c) => c.setor_origem_nome, sla)).map((g) => ({ chave: g.chave, total: g.total }))} />
              </Cartao>
              <Cartao titulo="Destinos mais frequentes">
                <Ranking dados={topN(agrupar(linhas, (c) => c.setor_destino_nome, sla)).map((g) => ({ chave: g.chave, total: g.total }))} />
              </Cartao>
              <Cartao titulo="Mapa de calor · hora × dia da semana" className="lg:col-span-2">
                <MapaCalor linhas={linhas} />
              </Cartao>
            </div>
          )}

          {aba === 'equipe' && <Equipe linhas={linhas} sla={sla} />}

          {aba === 'intervalos' && <Intervalos de={de} ate={ate} maqueiro={filtros.maqueiro} />}

          {aba === 'atrasos' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Cartao titulo="Causas agrupadas">
                <Rosca dados={gruposAtraso(linhas, sla)} />
              </Cartao>
              <Cartao titulo="Motivos informados">
                <Ranking dados={topN(motivosAtraso(linhas, sla).map((m) => ({ chave: m.motivo, total: m.qtd })))} />
              </Cartao>
              <Cartao titulo="Atrasos por maqueiro" className="lg:col-span-2">
                <Ranking
                  dados={topN(
                    agrupar(linhas, (c) => c.maqueiro_nome, sla)
                      .filter((g) => g.atrasados > 0)
                      .sort((a, b) => b.atrasados - a.atrasados)
                      .map((g) => ({ chave: g.chave, total: g.atrasados })),
                  )}
                />
              </Cartao>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Equipe({ linhas, sla }: { linhas: LinhaMetrica[]; sla: number }) {
  const porMaq = agrupar(linhas, (c) => c.maqueiro_nome, sla);
  const mediaEquipe = media(porMaq.map((g) => g.total));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Cartao titulo="Chamados por maqueiro (linha = média da equipe)" className="lg:col-span-2">
        <Colunas
          dados={topN(porMaq, 12).map((g) => ({ nome: g.chave.split(' ')[0] + (g.chave.split(' ')[1] ? ' ' + g.chave.split(' ')[1][0] + '.' : ''), total: g.total }))}
          x="nome"
          y="total"
          destacarMaior={false}
          linhaMedia={mediaEquipe}
        />
      </Cartao>
      <Cartao titulo="Tempo médio por maqueiro (min)">
        <Ranking
          dados={topN(porMaq.filter((g) => g.tempoMedio !== null).sort((a, b) => (b.tempoMedio ?? 0) - (a.tempoMedio ?? 0))).map((g) => ({
            chave: g.chave,
            total: Number((g.tempoMedio ?? 0).toFixed(1)),
          }))}
          sufixo=" min"
        />
      </Cartao>
      <Cartao titulo="Quem mais solicita">
        <Ranking dados={topN(agrupar(linhas, (c) => c.solicitante, sla)).map((g) => ({ chave: g.chave, total: g.total }))} />
      </Cartao>
    </div>
  );
}

export function MapaCalor({ linhas }: { linhas: LinhaMetrica[] }) {
  const { matriz, max, horas } = mapaCalor(linhas);
  if (!horas.length) return <p className="py-8 text-center text-sm text-slate-500">Sem dados no período.</p>;
  // escala sequencial de um só tom (azul), do claro ao escuro
  const cor = (v: number) => {
    if (!v) return 'transparent';
    const t = v / max;
    const l = 92 - t * 55;
    return `hsl(213 70% ${l}%)`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th />
            {horas.map((h) => (
              <th key={h} className="px-0.5 font-normal text-slate-500">
                {String(h).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matriz.map((linha, d) => (
            <tr key={d}>
              <th className="pr-2 text-left font-semibold">{DIAS_SEMANA[d]}</th>
              {horas.map((h) => (
                <td key={h} className="p-0.5">
                  <div
                    title={`${DIAS_SEMANA[d]} ${String(h).padStart(2, '0')}h: ${linha[h]} chamado(s)`}
                    className="flex h-7 w-8 items-center justify-center rounded border border-slate-200 tabular-nums dark:border-slate-800"
                    style={{ background: cor(linha[h]), color: linha[h] / max > 0.55 ? '#fff' : undefined }}
                  >
                    {linha[h] || ''}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Intervalos({ de, ate, maqueiro }: { de: string; ate: string; maqueiro?: string }) {
  const { data, isLoading, error } = useIntervalosPeriodo(de, ate);
  if (isLoading) return <Carregando />;
  if (error) return <Erro erro={error} />;
  const linhas = (data ?? []).filter((l) => !maqueiro || l.maqueiro_nome === maqueiro);
  const r = resumoIntervalos(linhas);
  const porMaq = intervalosPorMaqueiro(linhas);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Intervalos" valor={r.total} detalhe={r.emAndamento ? `${r.emAndamento} em andamento` : undefined} cor="blue" />
        <Kpi titulo="Tempo total" valor={fmtDuracao(r.minutosTotais)} cor="purple" />
        <Kpi titulo="Duração média" valor={fmtMin(r.media)} detalhe={`mediana ${fmtMin(r.mediana)}`} cor="teal" />
        <Kpi titulo="Maior intervalo" valor={fmtMin(r.maior)} cor="orange" />
      </div>
      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">
          Nenhum intervalo registrado no período.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Minutos de intervalo por maqueiro">
            <Ranking dados={topN(porMaq, 10).map((g) => ({ chave: g.chave, total: Math.round(g.minutos) }))} sufixo=" min" />
          </Cartao>
          <Cartao titulo="Início dos intervalos por hora">
            <Colunas dados={intervalosPorHora(linhas)} x="rotulo" y="total" nomeSerie="Intervalos" />
          </Cartao>
          <Cartao titulo="Por maqueiro" className="lg:col-span-2">
            <Tabela>
              <thead>
                <tr>
                  <th>Maqueiro</th>
                  <th>Intervalos</th>
                  <th>Total</th>
                  <th>Média</th>
                  <th>Maior</th>
                </tr>
              </thead>
              <tbody>
                {porMaq.map((g) => (
                  <tr key={g.chave}>
                    <td className="font-semibold">{g.chave}</td>
                    <td>{g.qtd}</td>
                    <td>{fmtDuracao(g.minutos)}</td>
                    <td>{fmtMin(g.media)}</td>
                    <td>{fmtMin(g.maior)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </Cartao>
          <Cartao titulo="Últimos intervalos" className="lg:col-span-2">
            <Tabela>
              <thead>
                <tr>
                  <th>Maqueiro</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Duração</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {[...linhas].reverse().slice(0, 30).map((l) => (
                  <tr key={l.id}>
                    <td>{l.maqueiro_nome}</td>
                    <td>{fmtDataHora(l.inicio)}</td>
                    <td>{l.fim ? fmtDataHora(l.fim) : <strong className="text-orange-600">em andamento</strong>}</td>
                    <td>{fmtMin(Number(l.minutos))}</td>
                    <td className="text-xs">{l.criado_por}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </Cartao>
        </div>
      )}
    </div>
  );
}
