import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Botao, Campo, Carregando, Entrada, Erro, Modal, Tabela } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { hojeLocal } from '@/lib/tempo';
import { useConfig } from '@/hooks/dados';
import { mensagemErro } from '@/lib/erros';
import type { CapacidadeHora } from '@/types/database';

export function useCapacidade(data: string) {
  return useQuery({
    queryKey: ['capacidade', data],
    queryFn: async () => {
      const { data: r, error } = await supabase.rpc('capacidade_dia', { p_data: data });
      if (error) throw error;
      return (r ?? []) as CapacidadeHora[];
    },
  });
}

export function CapacidadePage() {
  const [data, setData] = useState(hojeLocal());
  const { data: horas, isLoading, error } = useCapacidade(data);
  const [editar, setEditar] = useState(false);
  const deficits = (horas ?? []).filter((h) => h.deficit).length;
  const max = Math.max(1, ...(horas ?? []).map((h) => Math.max(h.capacidade, h.demanda_pico)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Capacidade operacional</h1>
          <p className="text-sm text-slate-500">
            Capacidade = maqueiros de plantão no meio da hora (escala + habilitações − indisponibilidades). Demanda = pico de chamados simultâneos na hora.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Campo rotulo="Data" htmlFor="cap_data">
            <Entrada id="cap_data" type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
          </Campo>
          <Botao variante="secundario" onClick={() => setEditar(true)}>
            Capacidade manual
          </Botao>
        </div>
      </div>
      {deficits > 0 && (
        <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">
          🔴 {deficits} hora(s) com demanda maior que a capacidade.
        </p>
      )}
      {isLoading ? (
        <Carregando />
      ) : error ? (
        <Erro erro={error} />
      ) : (
        <Tabela>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Capacidade</th>
              <th>Chamados abertos</th>
              <th>Pico simultâneo</th>
              <th className="w-1/3">Capacidade × demanda</th>
            </tr>
          </thead>
          <tbody>
            {(horas ?? []).map((h) => (
              <tr key={h.hora} className={clsx(h.deficit && 'bg-red-50 font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200')}>
                <td>{String(h.hora).padStart(2, '0')}h</td>
                <td>
                  {h.capacidade}
                  {h.capacidade_manual !== null && <span className="ml-1 text-xs text-slate-500">(manual; calc. {h.capacidade_calculada})</span>}
                </td>
                <td>{h.chamados_abertos}</td>
                <td>{h.demanda_pico}</td>
                <td>
                  <div className="space-y-0.5" aria-hidden>
                    <div className="h-2 rounded bg-sky-500" style={{ width: `${(h.capacidade / max) * 100}%` }} />
                    <div className={clsx('h-2 rounded', h.deficit ? 'bg-red-500' : 'bg-orange-400')} style={{ width: `${(h.demanda_pico / max) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
      <p className="text-xs text-slate-500">
        Barras: <span className="text-sky-600">azul = capacidade</span>, <span className="text-orange-600">laranja = demanda</span> (vermelho quando passa da capacidade).
      </p>
      {editar && <CapacidadeManualModal aoFechar={() => setEditar(false)} />}
    </div>
  );
}

function CapacidadeManualModal({ aoFechar }: { aoFechar: () => void }) {
  const qc = useQueryClient();
  const { data: config } = useConfig();
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(config?.capacidadeManual ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    const limpo: Record<string, number> = {};
    for (const [k, v] of Object.entries(valores)) if (v !== '' && !Number.isNaN(Number(v))) limpo[k] = Number(v);
    setSalvando(true);
    const { error } = await supabase.from('configuracoes').upsert({ chave: 'capacidade_manual', valor: limpo });
    setSalvando(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success('Capacidade manual salva');
    qc.invalidateQueries({ queryKey: ['config'] });
    qc.invalidateQueries({ queryKey: ['capacidade'] });
    aoFechar();
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Capacidade manual por hora" largura="max-w-2xl">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Deixe em branco para usar a capacidade calculada pela escala.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: 24 }, (_, h) => (
          <Campo key={h} rotulo={`${String(h).padStart(2, '0')}h`} htmlFor={`cm_${h}`}>
            <Entrada id={`cm_${h}`} type="number" min={0} value={valores[h] ?? ''} onChange={(e) => setValores({ ...valores, [h]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => setValores({})}>
          Limpar tudo
        </Botao>
        <Botao carregando={salvando} onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </Modal>
  );
}
