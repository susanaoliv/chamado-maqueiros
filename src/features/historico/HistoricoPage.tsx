import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Abas, Botao, Campo, Carregando, Entrada, Erro, Selecao, Tabela, Vazio } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fmtDataHora, hojeLocal, inputLocalParaIso, isoParaInputLocal, localParaIso } from '@/lib/tempo';
import { MOTIVOS_ATRASO } from '@/lib/constantes';
import { useCorrigirChamado } from '@/features/chamados/api';
import { StatusSelo, Trajeto } from '@/features/chamados/ChamadoCard';
import type { ChamadoMetrica, Evento } from '@/types/database';

const ROTULO_CAMPO: Record<string, string> = {
  aberto_em: 'Hora de abertura',
  maqueiro_informado_em: 'Hora informada ao maqueiro',
  inicio_atendimento_em: 'Início do atendimento',
  encerrado_em: 'Hora de término',
  motivo_atraso: 'Motivo do atraso',
  motivo_atraso_texto: 'Descrição do motivo',
};

const pareceData = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
const mostrarValor = (v: string | null) => (v === null ? '—' : pareceData(v) ? fmtDataHora(v) : v.length > 120 ? v.slice(0, 120) + '…' : v);

export function HistoricoPage() {
  const [aba, setAba] = useState<'historico' | 'correcao'>('historico');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Histórico e correções</h1>
        <Abas
          abas={[
            { id: 'historico', rotulo: 'Histórico de alterações' },
            { id: 'correcao', rotulo: 'Corrigir chamado' },
          ]}
          ativa={aba}
          onChange={setAba}
        />
      </div>
      {aba === 'historico' ? <Historico /> : <Correcao />}
    </div>
  );
}

function Historico() {
  const hoje = hojeLocal();
  const [f, setF] = useState({ numero: '', usuario: '', de: hoje, ate: hoje, entidade: '' });
  const q = useQuery({
    queryKey: ['historico', f],
    queryFn: async () => {
      let qb = supabase.from('vw_historico').select('*').order('em', { ascending: false }).limit(1000);
      if (f.de) qb = qb.gte('em', localParaIso(f.de));
      if (f.ate) qb = qb.lt('em', new Date(new Date(localParaIso(f.ate)).getTime() + 86400000).toISOString());
      if (f.numero.trim()) qb = qb.ilike('chamado_numero', `%${f.numero.trim()}%`);
      if (f.usuario.trim()) qb = qb.ilike('usuario', `%${f.usuario.trim()}%`);
      if (f.entidade) qb = qb.eq('entidade', f.entidade);
      const { data, error } = await qb;
      if (error) throw error;
      return data as Evento[];
    },
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Campo rotulo="Nº do chamado" htmlFor="h_num">
          <Entrada id="h_num" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} placeholder="CH-2026-…" />
        </Campo>
        <Campo rotulo="Usuário" htmlFor="h_usr">
          <Entrada id="h_usr" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} />
        </Campo>
        <Campo rotulo="De" htmlFor="h_de">
          <Entrada id="h_de" type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} />
        </Campo>
        <Campo rotulo="Até" htmlFor="h_ate">
          <Entrada id="h_ate" type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} />
        </Campo>
        <Campo rotulo="Registro" htmlFor="h_ent">
          <Selecao id="h_ent" value={f.entidade} onChange={(e) => setF({ ...f, entidade: e.target.value })}>
            <option value="">Todos</option>
            <option value="chamado">Chamados</option>
            <option value="maqueiros">Maqueiros</option>
            <option value="escala_dias">Escala</option>
            <option value="habilitacoes">Habilitações</option>
            <option value="indisponibilidades">Indisponibilidades</option>
            <option value="setores">Setores</option>
            <option value="configuracoes">Configurações</option>
            <option value="perfis">Acessos</option>
          </Selecao>
        </Campo>
      </div>
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <Erro erro={q.error} />
      ) : !q.data?.length ? (
        <Vazio>Nenhuma alteração encontrada com esses filtros.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Registro</th>
              <th>Ação</th>
              <th>Campo</th>
              <th>Antes</th>
              <th>Depois</th>
              <th>Justificativa</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((e) => (
              <tr key={e.id} className={e.acao === 'correcao' ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                <td className="whitespace-nowrap">{fmtDataHora(e.em)}</td>
                <td>{e.usuario}</td>
                <td className="whitespace-nowrap font-mono text-xs">{e.chamado_numero ?? e.entidade}</td>
                <td>{e.acao}</td>
                <td>{e.campo ? (ROTULO_CAMPO[e.campo] ?? e.campo) : ''}</td>
                <td className="max-w-xs break-words text-xs">{mostrarValor(e.valor_antigo)}</td>
                <td className="max-w-xs break-words text-xs">{mostrarValor(e.valor_novo)}</td>
                <td>{e.justificativa ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}

function Correcao() {
  const [numero, setNumero] = useState('');
  const [busca, setBusca] = useState('');
  const q = useQuery({
    queryKey: ['chamados', 'correcao', busca],
    enabled: !!busca,
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_chamados_metricas').select('*').ilike('numero', `%${busca}%`).limit(1).maybeSingle();
      if (error) throw error;
      return data as ChamadoMetrica | null;
    },
  });
  return (
    <div className="space-y-4">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(numero.trim().toUpperCase());
        }}
      >
        <Campo rotulo="Número do chamado" htmlFor="c_num">
          <Entrada id="c_num" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="CH-2026-000152 ou 152" />
        </Campo>
        <Botao type="submit">Buscar</Botao>
      </form>
      {q.isLoading && <Carregando />}
      {q.error && <Erro erro={q.error} />}
      {busca && q.data === null && <Vazio>Chamado não encontrado.</Vazio>}
      {q.data && <FormCorrecao c={q.data} />}
    </div>
  );
}

function FormCorrecao({ c }: { c: ChamadoMetrica }) {
  const corrigir = useCorrigirChamado();
  const [campo, setCampo] = useState<keyof typeof ROTULO_CAMPO>('aberto_em');
  const ehHora = !campo.startsWith('motivo');
  const atual = c[campo as keyof ChamadoMetrica] as string | null;
  const [valor, setValor] = useState(isoParaInputLocal(c.aberto_em));
  const [just, setJust] = useState('');

  const trocarCampo = (k: keyof typeof ROTULO_CAMPO) => {
    setCampo(k);
    const v = c[k as keyof ChamadoMetrica] as string | null;
    setValor(k.startsWith('motivo') ? (v ?? '') : isoParaInputLocal(v));
  };

  const salvar = () => {
    if (just.trim().length < 3) return toast.error('A justificativa é obrigatória.');
    const v = ehHora ? inputLocalParaIso(valor) : valor;
    corrigir.mutate({ p_chamado_id: c.id, p_campo: campo, p_valor: v, p_justificativa: just.trim() }, { onSuccess: () => setJust('') });
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-bold">{c.numero}</span>
        <StatusSelo status={c.status} />
      </div>
      <Trajeto c={c} />
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        {Object.entries(ROTULO_CAMPO).map(([k, r]) => (
          <div key={k}>
            <span className="text-slate-500">{r}:</span>{' '}
            {k.startsWith('motivo') ? ((c[k as keyof ChamadoMetrica] as string) ?? '—') : fmtDataHora(c[k as keyof ChamadoMetrica] as string)}
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Campo a corrigir" htmlFor="cr_campo">
          <Selecao id="cr_campo" value={campo} onChange={(e) => trocarCampo(e.target.value)}>
            {Object.entries(ROTULO_CAMPO).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo={`Novo valor (atual: ${ehHora ? fmtDataHora(atual) : (atual ?? '—')})`} htmlFor="cr_valor">
          {campo === 'motivo_atraso' ? (
            <Selecao id="cr_valor" value={valor} onChange={(e) => setValor(e.target.value)}>
              <option value="">(sem motivo)</option>
              {MOTIVOS_ATRASO.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Selecao>
          ) : (
            <Entrada id="cr_valor" type={ehHora ? 'datetime-local' : 'text'} value={valor} onChange={(e) => setValor(e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Justificativa" obrigatorio htmlFor="cr_just">
          <Entrada id="cr_just" value={just} onChange={(e) => setJust(e.target.value)} placeholder="ex.: hora conferida no livro da Central" />
        </Campo>
      </div>
      <Botao onClick={salvar} carregando={corrigir.isPending}>
        Registrar correção
      </Botao>
    </div>
  );
}
