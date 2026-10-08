import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Abas, Botao, Cartao, Campo, Carregando, Entrada, Erro, Modal, Selecao, Tabela } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useConfig, useSetores } from '@/hooks/dados';
import { mensagemErro } from '@/lib/erros';
import { normalizar } from '@/lib/regras';
import type { Perfil, Setor } from '@/types/database';

export function ConfiguracoesPage() {
  const [aba, setAba] = useState<'geral' | 'setores' | 'acessos'>('geral');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Configurações</h1>
        <Abas
          abas={[
            { id: 'geral', rotulo: 'Parâmetros' },
            { id: 'setores', rotulo: 'Setores' },
            { id: 'acessos', rotulo: 'Acessos' },
          ]}
          ativa={aba}
          onChange={setAba}
        />
      </div>
      {aba === 'geral' && <Parametros />}
      {aba === 'setores' && <Setores />}
      {aba === 'acessos' && <Acessos />}
    </div>
  );
}

function Parametros() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useConfig();
  const [sla, setSla] = useState('20');
  const [meta, setMeta] = useState('5');
  const [somenteNumero, setSomenteNumero] = useState(false);
  useEffect(() => {
    if (config) {
      setSla(String(config.sla));
      setMeta(String(config.metaAcionamento));
      setSomenteNumero(config.somenteNumeroAtendimento);
    }
  }, [config]);
  const salvar = useMutation({
    mutationFn: async () => {
      const s = Number(sla);
      const m = Number(meta);
      if (!(s > 0 && s <= 600) || !(m > 0 && m <= 120)) throw new Error('Valores inválidos');
      const { error } = await supabase.from('configuracoes').upsert([
        { chave: 'sla_minutos', valor: s },
        { chave: 'meta_acionamento_minutos', valor: m },
        { chave: 'usar_somente_numero_atendimento', valor: somenteNumero },
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configurações salvas');
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  if (isLoading) return <Carregando />;
  return (
    <Cartao className="max-w-xl">
      <div className="space-y-4">
        <Campo rotulo="SLA (minutos)" htmlFor="cfg_sla" dica="Tempo total máximo (abertura → término). Acima disso o chamado é atrasado e exige motivo ao encerrar.">
          <Entrada id="cfg_sla" type="number" min={1} value={sla} onChange={(e) => setSla(e.target.value)} />
        </Campo>
        <Campo rotulo="Meta de acionamento (minutos)" htmlFor="cfg_meta" dica="Tempo máximo entre a abertura e informar o maqueiro.">
          <Entrada id="cfg_meta" type="number" min={1} value={meta} onChange={(e) => setMeta(e.target.value)} />
        </Campo>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={somenteNumero} onChange={(e) => setSomenteNumero(e.target.checked)} />
          <span>
            <strong>Usar somente o nº do atendimento</strong>
            <span className="block text-sm text-slate-500">Por LGPD: o campo do paciente passa a aceitar apenas números (sem nome).</span>
          </span>
        </label>
        <Botao onClick={() => salvar.mutate()} carregando={salvar.isPending}>
          Salvar
        </Botao>
      </div>
    </Cartao>
  );
}

function Setores() {
  const qc = useQueryClient();
  const { data: setores, isLoading } = useSetores();
  const [editando, setEditando] = useState<Partial<Setor> | null>(null);
  const salvar = async (s: Partial<Setor>) => {
    if (!s.nome?.trim()) return toast.error('Informe o nome');
    const dados = { nome: s.nome.trim(), ativo: s.ativo ?? true, exige_leito: s.exige_leito ?? false, ordem: s.ordem ?? 100 };
    const { error } = s.id ? await supabase.from('setores').update(dados).eq('id', s.id) : await supabase.from('setores').insert(dados);
    if (error) return toast.error(mensagemErro(error));
    toast.success('Setor salvo');
    qc.invalidateQueries({ queryKey: ['setores'] });
    setEditando(null);
  };
  if (isLoading) return <Carregando />;
  return (
    <div className="space-y-3">
      <Botao onClick={() => setEditando({ ativo: true, exige_leito: false, ordem: 100 })}>+ Novo setor</Botao>
      <Tabela>
        <thead>
          <tr>
            <th>Ordem</th>
            <th>Setor</th>
            <th>Leito obrigatório</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(setores ?? []).map((s) => (
            <tr key={s.id} className={!s.ativo ? 'opacity-50' : ''}>
              <td>{s.ordem}</td>
              <td className="font-semibold">{s.nome}</td>
              <td>{s.exige_leito ? 'Sim' : 'Não'}</td>
              <td>{s.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                <Botao tamanho="sm" variante="secundario" onClick={() => setEditando(s)}>
                  Editar
                </Botao>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      {editando && (
        <Modal aberto aoFechar={() => setEditando(null)} titulo={editando.id ? `Editar ${editando.nome}` : 'Novo setor'}>
          <SetorForm inicial={editando} aoSalvar={salvar} />
        </Modal>
      )}
    </div>
  );
}

function SetorForm({ inicial, aoSalvar }: { inicial: Partial<Setor>; aoSalvar: (s: Partial<Setor>) => void }) {
  const [s, setS] = useState(inicial);
  return (
    <div className="space-y-3">
      <Campo rotulo="Nome" htmlFor="st_nome">
        <Entrada id="st_nome" value={s.nome ?? ''} onChange={(e) => setS({ ...s, nome: e.target.value })} />
      </Campo>
      <Campo rotulo="Ordem na lista" htmlFor="st_ordem">
        <Entrada id="st_ordem" type="number" value={s.ordem ?? 100} onChange={(e) => setS({ ...s, ordem: Number(e.target.value) })} />
      </Campo>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={!!s.exige_leito} onChange={(e) => setS({ ...s, exige_leito: e.target.checked })} />
        Leito de origem obrigatório
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={s.ativo ?? true} onChange={(e) => setS({ ...s, ativo: e.target.checked })} />
        Ativo (inativo some dos formulários, mas o histórico é mantido)
      </label>
      <Botao onClick={() => aoSalvar(s)}>Salvar</Botao>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Acessos: via Edge Function admin-usuarios (a service_role fica só no servidor)
// ----------------------------------------------------------------------------
async function adminUsuarios<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).erro ?? msg;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(msg);
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro);
  return data as T;
}

function Acessos() {
  const qc = useQueryClient();
  const { data: setores = [] } = useSetores();
  const lista = useQuery({
    queryKey: ['acessos'],
    queryFn: () => adminUsuarios<{ perfis: Perfil[] }>({ acao: 'listar' }).then((r) => r.perfis),
  });
  const [senha, setSenha] = useState<{ usuario: string; senha: string } | null>(null);
  const [novo, setNovo] = useState({ papel: 'setor', setor_id: '', usuario: '', nome: '' });
  const acao = useMutation({
    mutationFn: (body: Record<string, unknown>) => adminUsuarios<{ usuario: string; senha?: string }>(body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['acessos'] });
      if (r.senha) setSenha({ usuario: r.usuario, senha: r.senha });
      else toast.success('Acesso atualizado');
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const setorNome = (id: string | null) => setores.find((s) => s.id === id)?.nome ?? '';

  return (
    <div className="space-y-4">
      <Cartao titulo="Criar acesso">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Perfil" htmlFor="ac_papel">
            <Selecao id="ac_papel" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}>
              <option value="setor">Setor (enfermagem)</option>
              <option value="telefonista">Telefonista</option>
              <option value="gestao">Gestão</option>
            </Selecao>
          </Campo>
          {novo.papel === 'setor' && (
            <Campo rotulo="Setor" htmlFor="ac_setor">
              <Selecao
                id="ac_setor"
                value={novo.setor_id}
                onChange={(e) => {
                  const nome = setorNome(e.target.value);
                  setNovo({ ...novo, setor_id: e.target.value, usuario: normalizar(nome), nome });
                }}
              >
                <option value="">Selecione…</option>
                {setores
                  .filter((s) => s.ativo)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Usuário" htmlFor="ac_usuario" dica="Sem acento e sem espaço.">
            <Entrada id="ac_usuario" value={novo.usuario} onChange={(e) => setNovo({ ...novo, usuario: normalizar(e.target.value) })} />
          </Campo>
          <Campo rotulo="Nome exibido" htmlFor="ac_nome">
            <Entrada id="ac_nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </Campo>
        </div>
        <Botao
          className="mt-3"
          carregando={acao.isPending}
          disabled={!novo.usuario || (novo.papel === 'setor' && !novo.setor_id)}
          onClick={() => acao.mutate({ acao: 'criar', ...novo, setor_id: novo.papel === 'setor' ? novo.setor_id : null })}
        >
          Criar acesso e gerar senha
        </Botao>
      </Cartao>

      {lista.isLoading ? (
        <Carregando />
      ) : lista.error ? (
        <Erro erro={lista.error} />
      ) : (
        <Tabela>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Nome</th>
              <th>Setor</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(lista.data ?? []).map((p) => (
              <tr key={p.id} className={!p.ativo ? 'opacity-50' : ''}>
                <td className="font-mono">{p.usuario}</td>
                <td>{p.papel}</td>
                <td>{p.nome}</td>
                <td>{setorNome(p.setor_id)}</td>
                <td>{p.ativo ? 'Ativo' : 'Bloqueado'}</td>
                <td className="flex gap-2">
                  <Botao tamanho="sm" variante="secundario" onClick={() => acao.mutate({ acao: 'redefinir', usuario: p.usuario })}>
                    Nova senha
                  </Botao>
                  <Botao tamanho="sm" variante="fantasma" onClick={() => acao.mutate({ acao: 'ativar', usuario: p.usuario, ativo: !p.ativo })}>
                    {p.ativo ? 'Bloquear' : 'Desbloquear'}
                  </Botao>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}

      {senha && (
        <Modal aberto aoFechar={() => setSenha(null)} titulo="Senha gerada">
          <p className="text-sm">Anote e entregue por canal seguro. Ela não será mostrada de novo.</p>
          <div className="mt-3 rounded-lg bg-slate-100 p-4 font-mono text-lg dark:bg-slate-800">
            usuário: <strong>{senha.usuario}</strong>
            <br />
            senha: <strong>{senha.senha}</strong>
          </div>
          <Botao className="mt-3" onClick={() => navigator.clipboard?.writeText(`${senha.usuario} / ${senha.senha}`).then(() => toast.success('Copiado'))}>
            Copiar
          </Botao>
        </Modal>
      )}
    </div>
  );
}
