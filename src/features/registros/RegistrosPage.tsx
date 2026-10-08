import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Botao, Campo, Carregando, Entrada, Erro, Kpi, Modal, Selecao, Tabela, Vazio } from '@/components/ui';
import { useChamadosPeriodo, useConfig, useMaqueiros, useSetores } from '@/hooks/dados';
import { supabase } from '@/lib/supabase';
import { fmtDataHora, fmtDuracao, fmtHora, fmtMin, hojeLocal, localParaIso } from '@/lib/tempo';
import { STATUS_INFO, type StatusChamado } from '@/lib/constantes';
import { resumo } from '@/lib/metricas';
import { exportarCsv, exportarXlsx } from '@/lib/exportar';
import { secaoListaChamados } from '@/features/relatorios/secoes';
import { StatusSelo, Trajeto } from '@/features/chamados/ChamadoCard';
import { mensagemErro } from '@/lib/erros';
import type { ChamadoMetrica, Evento } from '@/types/database';

const addDia = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ROTULO_ACAO: Record<string, string> = {
  criacao: 'Chamado aberto',
  acionamento: 'Maqueiro informado',
  troca_maqueiro: 'Troca de maqueiro',
  mudanca_status: 'Mudança de status',
  encerramento: 'Encerrado',
  cancelamento: 'Cancelado',
  correcao: 'Correção (gestão)',
};
const ROTULO_CAMPO: Record<string, string> = {
  status: 'Status',
  maqueiro_id: 'Maqueiro',
  maqueiro_informado_em: 'Hora informada ao maqueiro',
  inicio_atendimento_em: 'Início do atendimento',
  encerrado_em: 'Término',
  aberto_em: 'Abertura',
  motivo_atraso: 'Motivo do atraso',
  motivo_atraso_texto: 'Descrição do motivo',
  cancelado_motivo: 'Justificativa',
  cancelado_em: 'Cancelado em',
  numero: 'Número',
};
const CAMPOS_OCULTOS = new Set(['encerrado_por', 'cancelado_por']);

export function RegistrosPage() {
  const hoje = hojeLocal();
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [f, setF] = useState({ setor: '', status: '', maqueiro: '', busca: '' });
  const [aberto, setAberto] = useState<ChamadoMetrica | null>(null);
  const [ini, fim] = de <= ate ? [de, ate] : [ate, de];
  const { data, isLoading, error } = useChamadosPeriodo(localParaIso(ini), localParaIso(addDia(fim, 1)));
  const { data: setores = [] } = useSetores();
  const { data: maqueiros = [] } = useMaqueiros(true);
  const { data: config } = useConfig();
  const sla = config?.sla ?? 20;

  const linhas = useMemo(() => {
    const b = f.busca.trim().toLowerCase();
    return (data ?? [])
      .filter(
        (c) =>
          (!f.setor || c.setor_origem_nome === f.setor || c.setor_destino_nome === f.setor) &&
          (!f.status || (f.status === 'atrasado' ? c.atrasado : c.status === f.status)) &&
          (!f.maqueiro || c.maqueiro_nome === f.maqueiro) &&
          (!b || [c.numero, c.paciente, c.solicitante, c.leito_origem, c.leito_destino].some((x) => x?.toLowerCase().includes(b))),
      )
      .sort((a, b2) => b2.aberto_em.localeCompare(a.aberto_em));
  }, [data, f]);
  const r = useMemo(() => resumo(linhas, sla, config?.metaAcionamento ?? 5), [linhas, sla, config?.metaAcionamento]);

  const nomeArquivo = `registros_chamados_${ini}${ini !== fim ? `_a_${fim}` : ''}`;
  const exportar = async (tipo: 'xlsx' | 'csv') => {
    try {
      const sec = secaoListaChamados(linhas);
      if (tipo === 'csv') exportarCsv(nomeArquivo, [sec]);
      else await exportarXlsx(nomeArquivo, [sec]);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Registros de chamados</h1>
          <p className="text-sm text-slate-500">Consulte horários e tempos de cada chamado. Clique numa linha para ver a linha do tempo completa.</p>
        </div>
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={() => exportar('xlsx')} disabled={!linhas.length}>
            Excel
          </Botao>
          <Botao variante="secundario" onClick={() => exportar('csv')} disabled={!linhas.length}>
            CSV
          </Botao>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Campo rotulo="De" htmlFor="rg_de">
          <Entrada id="rg_de" type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até" htmlFor="rg_ate">
          <Entrada id="rg_ate" type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
        </Campo>
        <Campo rotulo="Setor (origem ou destino)" htmlFor="rg_setor">
          <Selecao id="rg_setor" value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })}>
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s.id}>{s.nome}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Status" htmlFor="rg_status">
          <Selecao id="rg_status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_INFO) as (StatusChamado | 'atrasado')[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_INFO[s].icone} {STATUS_INFO[s].rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Maqueiro" htmlFor="rg_maq">
          <Selecao id="rg_maq" value={f.maqueiro} onChange={(e) => setF({ ...f, maqueiro: e.target.value })}>
            <option value="">Todos</option>
            {maqueiros.map((m) => (
              <option key={m.id}>{m.nome}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Buscar" htmlFor="rg_busca">
          <Entrada id="rg_busca" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} placeholder="nº, paciente, leito…" />
        </Campo>
      </div>

      {isLoading ? (
        <Carregando />
      ) : error ? (
        <Erro erro={error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi titulo="Chamados" valor={r.total} cor="blue" />
            <Kpi titulo="Concluídos" valor={r.concluidos} cor="green" />
            <Kpi titulo="Cancelados" valor={r.cancelados} cor="slate" />
            <Kpi titulo="Tempo médio" valor={fmtMin(r.tempoMedio)} cor="purple" />
            <Kpi titulo="Acionamento médio" valor={fmtMin(r.acionamentoMedio, 1)} cor="teal" />
          </div>
          {linhas.length === 0 ? (
            <Vazio>Nenhum chamado encontrado com esses filtros.</Vazio>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Abertura</th>
                  <th>Trajeto</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Maqueiro</th>
                  <th>Acionado</th>
                  <th>Início</th>
                  <th>Término</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => setAberto(c)}
                    onKeyDown={(e) => e.key === 'Enter' && setAberto(c)}
                    className={clsx('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60', c.atrasado && 'text-red-700 dark:text-red-300')}
                  >
                    <td className="whitespace-nowrap font-mono text-xs font-bold">{c.numero}</td>
                    <td className="whitespace-nowrap">{fmtDataHora(c.aberto_em)}</td>
                    <td className="min-w-48">
                      {c.setor_origem_nome}
                      {c.leito_origem && ` (${c.leito_origem})`} → {c.setor_destino_nome ?? '—'}
                      {c.leito_destino && ` (${c.leito_destino})`}
                    </td>
                    <td>{c.tipo}</td>
                    <td>
                      <StatusSelo status={c.status} atrasado={c.atrasado} />
                    </td>
                    <td>{c.maqueiro_nome ?? '—'}</td>
                    <td className="whitespace-nowrap">
                      {fmtHora(c.maqueiro_informado_em)}
                      {c.min_acionamento !== null && <span className="text-xs text-slate-500"> (+{fmtDuracao(Number(c.min_acionamento))})</span>}
                    </td>
                    <td>{fmtHora(c.inicio_atendimento_em)}</td>
                    <td>{fmtHora(c.encerrado_em ?? c.cancelado_em)}</td>
                    <td className="whitespace-nowrap font-semibold">{c.min_total === null ? '—' : fmtDuracao(Number(c.min_total))}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </>
      )}
      {aberto && <DetalheChamado c={aberto} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

function DetalheChamado({ c, aoFechar }: { c: ChamadoMetrica; aoFechar: () => void }) {
  const { data: maqueiros = [] } = useMaqueiros(true);
  const eventos = useQuery({
    queryKey: ['historico', 'chamado', c.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_historico').select('*').eq('chamado_id', c.id).order('em');
      if (error) throw error;
      return data as Evento[];
    },
  });
  const nomeMaqueiro = (id: string | null) => maqueiros.find((m) => m.id === id)?.nome ?? id ?? '—';
  const valor = (campo: string | null, v: string | null) => {
    if (v === null) return '—';
    if (campo === 'maqueiro_id') return nomeMaqueiro(v);
    if (campo === 'status') return STATUS_INFO[v as StatusChamado]?.rotulo ?? v;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDataHora(v);
    return v;
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`${c.numero}`} largura="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelo status={c.status} atrasado={c.atrasado} />
          <span className="text-sm text-slate-500">
            {c.tipo} · {c.prioridade} · {c.recurso}
          </span>
        </div>
        <Trajeto c={c} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {[
            ['Abertura', fmtDataHora(c.aberto_em)],
            ['Maqueiro informado', fmtDataHora(c.maqueiro_informado_em)],
            ['Início do atendimento', fmtDataHora(c.inicio_atendimento_em)],
            ['Término', fmtDataHora(c.encerrado_em ?? c.cancelado_em)],
            ['Abertura → acionamento', c.min_acionamento === null ? '—' : fmtDuracao(Number(c.min_acionamento))],
            ['Tempo total', c.min_total === null ? '—' : fmtDuracao(Number(c.min_total))],
            ['Paciente', c.paciente ?? '—'],
            ['Solicitante', c.solicitante ?? '—'],
            ['Origem do chamado', c.origem_chamado],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {c.motivo_atraso && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            Motivo do atraso: {c.motivo_atraso}
            {c.motivo_atraso_texto && ` (${c.motivo_atraso_texto})`}
          </p>
        )}
        {c.cancelado_motivo && (
          <p className="rounded bg-slate-100 p-2 text-sm dark:bg-slate-800">
            Cancelado por {c.cancelado_por}: {c.cancelado_motivo}
          </p>
        )}

        <div>
          <h3 className="mb-2 font-semibold">Linha do tempo</h3>
          {eventos.isLoading ? (
            <Carregando />
          ) : eventos.error ? (
            <Erro erro={eventos.error} />
          ) : (
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
              {(eventos.data ?? [])
                .filter((e) => !CAMPOS_OCULTOS.has(e.campo ?? ''))
                .map((e) => (
                  <li key={e.id} className="text-sm">
                    <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-marca-500" />
                    <div className="font-semibold">
                      {fmtDataHora(e.em)} · {ROTULO_ACAO[e.acao] ?? e.acao}
                    </div>
                    {e.acao !== 'criacao' && e.campo && (
                      <div className="text-slate-600 dark:text-slate-300">
                        {ROTULO_CAMPO[e.campo] ?? e.campo}: {valor(e.campo, e.valor_antigo)} → <strong>{valor(e.campo, e.valor_novo)}</strong>
                      </div>
                    )}
                    <div className="text-xs text-slate-500">
                      {e.usuario}
                      {e.justificativa && ` · ${e.justificativa}`}
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}
