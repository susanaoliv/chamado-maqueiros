import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, buscarTudo } from '@/lib/supabase';
import { agora, localParaIso, hojeLocal } from '@/lib/tempo';
import { ABERTOS } from '@/lib/regras';
import type { ChamadoMetrica, Json } from '@/types/database';

export function useSetores() {
  return useQuery({
    queryKey: ['setores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setores').select('*').order('ordem').order('nome');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type Config = {
  sla: number;
  metaAcionamento: number;
  somenteNumeroAtendimento: boolean;
  capacidadeManual: Record<string, number>;
};

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase.from('configuracoes').select('*');
      if (error) throw error;
      const m = new Map<string, Json>(data.map((r) => [r.chave, r.valor]));
      return {
        sla: Number(m.get('sla_minutos') ?? 20),
        metaAcionamento: Number(m.get('meta_acionamento_minutos') ?? 5),
        somenteNumeroAtendimento: Boolean(m.get('usar_somente_numero_atendimento') ?? false),
        capacidadeManual: (m.get('capacidade_manual') as Record<string, number>) ?? {},
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMaqueiros(incluirInativos = false) {
  return useQuery({
    queryKey: ['maqueiros', incluirInativos],
    queryFn: async () => {
      let q = supabase.from('maqueiros').select('*').order('nome');
      if (!incluirInativos) q = q.eq('ativo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function usePainelMaqueiros() {
  return useQuery({
    queryKey: ['painel'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('painel_maqueiros');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60 * 1000, // turnos começam/terminam com o passar do tempo
  });
}

/** Chamados em aberto + finalizados hoje (Central e Meus chamados). A RLS limita o setor aos próprios. */
export function useChamadosOperacao() {
  return useQuery({
    queryKey: ['chamados', 'operacao'],
    queryFn: async () => {
      const inicioHoje = localParaIso(hojeLocal());
      const filtro = [
        `status.in.(${ABERTOS.join(',')})`,
        `aberto_em.gte.${inicioHoje}`,
        `encerrado_em.gte.${inicioHoje}`,
        `cancelado_em.gte.${inicioHoje}`,
      ].join(',');
      return buscarTudo<ChamadoMetrica>((de, ate) =>
        supabase.from('vw_chamados_metricas').select('*').or(filtro).order('aberto_em', { ascending: false }).range(de, ate),
      );
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

/** Chamados de um período (dashboard e relatórios). */
export function useChamadosPeriodo(de: string, ate: string, habilitado = true) {
  return useQuery({
    queryKey: ['chamados', 'periodo', de, ate],
    enabled: habilitado,
    queryFn: () =>
      buscarTudo<ChamadoMetrica>((i, f) =>
        supabase.from('vw_chamados_metricas').select('*').gte('aberto_em', de).lt('aberto_em', ate).order('aberto_em').range(i, f),
      ),
  });
}

/**
 * Tempo real: escuta as tabelas e invalida as consultas afetadas.
 * Os formulários guardam o próprio estado, então nada que está sendo digitado se perde.
 */
export function useRealtimeSync(ativo: boolean) {
  const qc = useQueryClient();
  const [conectado, setConectado] = useState(false);
  useEffect(() => {
    if (!ativo) return;
    const pendentes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidar = (...chaves: string[]) => {
      chaves.forEach((c) => pendentes.add(c));
      clearTimeout(timer);
      timer = setTimeout(() => {
        pendentes.forEach((c) => qc.invalidateQueries({ queryKey: [c] }));
        pendentes.clear();
      }, 250);
    };
    const canal = supabase
      .channel('maqueiros-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, () => invalidar('chamados', 'painel', 'capacidade'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habilitacoes' }, () => invalidar('painel', 'habilitacoes', 'capacidade'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'indisponibilidades' }, () =>
        invalidar('painel', 'indisponibilidades', 'capacidade'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maqueiros' }, () => invalidar('painel', 'maqueiros'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_dias' }, () => invalidar('painel', 'escala', 'capacidade'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, () => invalidar('config', 'capacidade'))
      .subscribe((status) => {
        setConectado(status === 'SUBSCRIBED');
        // ao reconectar, recarrega tudo o que pode ter mudado enquanto estava offline
        if (status === 'SUBSCRIBED') invalidar('chamados', 'painel');
      });
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [ativo, qc]);
  return conectado;
}

/** Relógio que atualiza a cada `ms` (usa a hora corrigida do servidor). */
export function useAgora(ms = 15000) {
  const [t, setT] = useState(agora());
  useEffect(() => {
    const id = setInterval(() => setT(agora()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}
