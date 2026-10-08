import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/erros';
import type { Database } from '@/types/database';

type Fn = Database['public']['Functions'];

async function rpc<K extends keyof Fn>(nome: K, args: Fn[K]['Args']): Promise<Fn[K]['Returns']> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw error;
  return data as Fn[K]['Returns'];
}

/** Mutação padrão: chama a RPC, invalida chamados/painel e mostra toast de erro. */
function useRpc<K extends keyof Fn>(nome: K, opts?: { sucesso?: (r: Fn[K]['Returns']) => string | null; silenciarErro?: boolean }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Fn[K]['Args']) => rpc(nome, args),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['chamados'] });
      qc.invalidateQueries({ queryKey: ['painel'] });
      qc.invalidateQueries({ queryKey: ['habilitacoes'] });
      qc.invalidateQueries({ queryKey: ['indisponibilidades'] });
      qc.invalidateQueries({ queryKey: ['historico'] });
      qc.invalidateQueries({ queryKey: ['ofertas'] });
      qc.invalidateQueries({ queryKey: ['jornadas'] });
      const msg = opts?.sucesso?.(r);
      if (msg) toast.success(msg);
    },
    onError: (e) => {
      if (!opts?.silenciarErro) toast.error(mensagemErro(e));
    },
  });
}

export const useAbrirChamado = () => useRpc('abrir_chamado');
export const useAcionarMaqueiro = () => useRpc('acionar_maqueiro', { sucesso: (c) => `Maqueiro informado no ${c.numero}` });
export const useMudarStatus = () => useRpc('mudar_status', { sucesso: () => 'Status atualizado' });
export const useEncerrarChamado = () => useRpc('encerrar_chamado', { silenciarErro: true });
export const useCancelarChamado = () => useRpc('cancelar_chamado', { sucesso: (c) => `Chamado ${c.numero} cancelado` });
export const useCorrigirChamado = () => useRpc('corrigir_chamado', { sucesso: () => 'Correção registrada' });

export const useHabilitar = () => useRpc('habilitar_maqueiro', { sucesso: () => 'Maqueiro habilitado' });
export const useDesabilitar = () => useRpc('desabilitar_maqueiro', { sucesso: () => 'Habilitação removida' });
export const useIndisponivel = () => useRpc('marcar_indisponivel', { sucesso: () => 'Maqueiro marcado como indisponível' });
export const useDisponibilizar = () => useRpc('disponibilizar_maqueiro', { sucesso: () => 'Maqueiro disponível novamente' });
export const useIntervalo = () => useRpc('definir_intervalo', { sucesso: () => 'Intervalo atualizado' });
export const useRedistribuir = () => useRpc('redistribuir_chamado', { sucesso: () => 'Chamado reenviado para a fila do app' });
export const useEncerrarJornada = () => useRpc('encerrar_jornada', { sucesso: () => 'Jornada encerrada' });
