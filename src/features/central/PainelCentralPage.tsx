import { useMemo } from 'react';
import { Carregando, Kpi } from '@/components/ui';
import { useAgora, useChamadosOperacao, useConfig } from '@/hooks/dados';
import { estaAberto, estaAtrasado } from '@/lib/regras';
import { fmtDataExtenso, hojeLocal, minutosEntre } from '@/lib/tempo';
import { media } from '@/lib/metricas';
import type { ChamadoMetrica } from '@/types/database';

export function IndicadoresDia({ chamados, sla, agora, compacto }: { chamados: ChamadoMetrica[]; sla: number; agora: Date; compacto?: boolean }) {
  const r = useMemo(() => {
    const hoje = hojeLocal(agora);
    const doDia = chamados.filter((c) => c.data_local === hoje);
    const abertos = chamados.filter((c) => estaAberto(c.status));
    const concluidosHoje = chamados.filter((c) => c.status === 'concluido' && c.encerrado_em && hojeLocal(new Date(c.encerrado_em)) === hoje);
    const atrasados =
      abertos.filter((c) => estaAtrasado(c, sla, agora)).length +
      concluidosHoje.filter((c) => (minutosEntre(c.aberto_em, c.encerrado_em) ?? 0) > sla).length;
    return {
      hoje: doDia.length,
      pendentes: abertos.filter((c) => c.status === 'aguardando_maqueiro').length,
      andamento: abertos.filter((c) => c.status !== 'aguardando_maqueiro').length,
      concluidos: concluidosHoje.length,
      atrasados,
      tempoMedio: media(concluidosHoje.map((c) => Number(c.min_total))),
    };
  }, [chamados, sla, agora]);

  return (
    <div className={`grid gap-3 ${compacto ? 'grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 md:grid-cols-3'}`}>
      <Kpi titulo="Chamados hoje" valor={r.hoje} cor="blue" />
      <Kpi titulo="Pendentes" valor={r.pendentes} cor="orange" detalhe={compacto ? undefined : 'sem maqueiro'} />
      <Kpi titulo="Em andamento" valor={r.andamento} cor="purple" />
      <Kpi titulo="Concluídos" valor={r.concluidos} cor="green" />
      <Kpi titulo="Atrasados" valor={r.atrasados} cor={r.atrasados ? 'red' : 'slate'} detalhe={compacto ? undefined : `acima de ${sla} min`} />
      <Kpi titulo="Tempo médio" valor={r.tempoMedio === null ? '—' : `${Math.round(r.tempoMedio)}′`} cor="teal" detalhe={compacto ? undefined : 'minutos (concluídos hoje)'} />
    </div>
  );
}

export function PainelCentralPage() {
  const agora = useAgora(15000);
  const { data: chamados, isLoading } = useChamadosOperacao();
  const { data: config } = useConfig();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold first-letter:uppercase">Painel da Central · {fmtDataExtenso(agora)}</h1>
      {isLoading || !chamados ? <Carregando /> : <IndicadoresDia chamados={chamados} sla={config?.sla ?? 20} agora={agora} />}
    </div>
  );
}
