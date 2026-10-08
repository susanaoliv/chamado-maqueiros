import { useMemo, useState } from 'react';
import { Botao, Carregando, Erro, Modal, Vazio } from '@/components/ui';
import { useAgora, useChamadosOperacao, useConfig, useOfertasRecentes, usePainelMaqueiros } from '@/hooks/dados';
import { ChamadoCard, ordenarFila } from '@/features/chamados/ChamadoCard';
import { NovoChamadoForm } from '@/features/chamados/NovoChamadoForm';
import { estaAberto, estaAtrasado } from '@/lib/regras';
import { hojeLocal } from '@/lib/tempo';
import { TZ } from '@/lib/constantes';
import { formatInTimeZone } from 'date-fns-tz';
import { IndicadoresDia } from './PainelCentralPage';

export function CentralPage() {
  const [novo, setNovo] = useState(false);
  const agora = useAgora(5000);
  const { data: ofertas = [] } = useOfertasRecentes();
  const { data: chamados, isLoading, error } = useChamadosOperacao();
  const { data: config } = useConfig();
  const { data: painel = [] } = usePainelMaqueiros();
  const sla = config?.sla ?? 20;
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'atrasados'>('todos');

  const { fila, finalizadosHoje } = useMemo(() => {
    const hoje = hojeLocal(agora);
    const lista = chamados ?? [];
    const fila = lista
      .filter((c) => estaAberto(c.status))
      .filter((c) => (filtro === 'pendentes' ? c.status === 'aguardando_maqueiro' : filtro === 'atrasados' ? estaAtrasado(c, sla, agora) : true))
      .sort(ordenarFila);
    const finalizadosHoje = lista
      .filter((c) => !estaAberto(c.status))
      .filter((c) => formatInTimeZone(c.encerrado_em ?? c.cancelado_em ?? c.aberto_em, TZ, 'yyyy-MM-dd') === hoje)
      .sort((a, b) => (b.encerrado_em ?? b.cancelado_em ?? '').localeCompare(a.encerrado_em ?? a.cancelado_em ?? ''));
    return { fila, finalizadosHoje };
  }, [chamados, filtro, sla, agora]);

  const livres = painel.filter((m) => m.situacao === 'disponivel').length;
  const deServico = painel.filter((m) => m.disponivel_para_acionar).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao tamanho="xl" className="sm:w-auto" onClick={() => setNovo(true)} data-testid="novo-chamado">
          + NOVO CHAMADO
        </Botao>
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Maqueiros: <strong className="text-green-700 dark:text-green-400">{livres} livres</strong> de {deServico} de plantão agora
        </div>
      </div>

      {chamados && <IndicadoresDia chamados={chamados} sla={sla} agora={agora} compacto />}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Fila de chamados em aberto ({fila.length})</h2>
          <div className="flex gap-1 text-sm">
            {(['todos', 'pendentes', 'atrasados'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-full px-3 py-1 font-semibold ${filtro === f ? 'bg-marca-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}
              >
                {f === 'todos' ? 'Todos' : f === 'pendentes' ? '🟡 Sem maqueiro' : '🔴 Atrasados'}
              </button>
            ))}
          </div>
        </div>
        {isLoading && <Carregando />}
        {error && <Erro erro={error} />}
        {!isLoading && fila.length === 0 && <Vazio>Nenhum chamado em aberto. 👍</Vazio>}
        <div className="grid gap-3 xl:grid-cols-2">
          {fila.map((c) => (
            <ChamadoCard key={c.id} c={c} sla={sla} agora={agora} modo="central" maqueiros={painel} ofertas={ofertas.filter((o) => o.chamado_id === c.id)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Concluídos e cancelados hoje ({finalizadosHoje.length})</h2>
        {finalizadosHoje.length === 0 ? (
          <Vazio>Nenhum chamado finalizado hoje.</Vazio>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {finalizadosHoje.map((c) => (
              <ChamadoCard key={c.id} c={c} sla={sla} agora={agora} modo="central" />
            ))}
          </div>
        )}
      </section>

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo chamado" largura="max-w-2xl">
        <NovoChamadoForm aoConcluir={() => setNovo(false)} />
      </Modal>
    </div>
  );
}
