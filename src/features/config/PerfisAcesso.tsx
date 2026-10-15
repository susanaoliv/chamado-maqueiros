import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AreaTexto, Botao, Campo, Carregando, Cartao, Entrada, Erro, Modal, Selecao } from '@/components/ui';
import { Icone } from '@/components/Icone';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/erros';
import { NOME_NIVEL, PERFIS_PADRAO, TELAS, TELAS_DO_NIVEL, type NivelPerfil, type Papel } from '@/lib/telas';
import type { PerfilAcesso } from '@/types/database';

export function usePerfisAcesso() {
  return useQuery({
    queryKey: ['perfis_acesso'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis_acesso').select('*').order('nome');
      if (error) throw error;
      return data;
    },
  });
}

// ----------------------------------------------------------------------------
// Escolha do perfil de um usuário (aba Acessos): padrão ou personalizado.
// Valor do <select>: "papel:gestao" ou "pa:<id do perfil personalizado>".
// ----------------------------------------------------------------------------
export function valorOpcaoPerfil(papel: string, perfilAcessoId: string | null) {
  return perfilAcessoId ? `pa:${perfilAcessoId}` : `papel:${papel}`;
}

export function resolverOpcaoPerfil(valor: string, perfis: PerfilAcesso[]): { papel: Papel; perfil_acesso_id: string | null } {
  if (valor.startsWith('pa:')) {
    const pa = perfis.find((p) => p.id === valor.slice(3));
    return { papel: (pa?.papel_base ?? 'setor') as Papel, perfil_acesso_id: pa?.id ?? null };
  }
  return { papel: valor.slice(6) as Papel, perfil_acesso_id: null };
}

export function nomePerfilUsuario(papel: string, perfilAcessoId: string | null, perfis: PerfilAcesso[]) {
  if (perfilAcessoId) return perfis.find((p) => p.id === perfilAcessoId)?.nome ?? 'Perfil personalizado';
  return PERFIS_PADRAO.find((p) => p.papel === papel)?.nome ?? papel;
}

export function OpcoesPerfil({ perfis, comMaqueiro, atualId }: { perfis: PerfilAcesso[]; comMaqueiro?: boolean; atualId?: string | null }) {
  const personalizados = perfis.filter((p) => p.ativo || p.id === atualId);
  return (
    <>
      <optgroup label="Perfis padrão">
        {PERFIS_PADRAO.filter((p) => comMaqueiro || p.papel !== 'maqueiro').map((p) => (
          <option key={p.papel} value={`papel:${p.papel}`}>
            {p.papel === 'maqueiro' ? 'Maqueiro (app)' : p.nome}
          </option>
        ))}
      </optgroup>
      {personalizados.length > 0 && (
        <optgroup label="Perfis criados">
          {personalizados.map((p) => (
            <option key={p.id} value={`pa:${p.id}`} disabled={!p.ativo}>
              {p.nome}
              {!p.ativo && ' (desativado)'}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Aba Configurações → Perfis
// ----------------------------------------------------------------------------
type Rascunho = { id?: string; nome: string; descricao: string; papel_base: NivelPerfil; telas: string[]; ativo: boolean };

export function PerfisAcesso() {
  const qc = useQueryClient();
  const lista = usePerfisAcesso();
  // Quantos usuários ativos usam cada perfil (a gestão enxerga todos os perfis de usuário)
  const usos = useQuery({
    queryKey: ['perfis_acesso', 'usos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis').select('papel, perfil_acesso_id, ativo').eq('ativo', true);
      if (error) throw error;
      return data;
    },
  });
  const contar = (filtro: (u: { papel: string; perfil_acesso_id: string | null }) => boolean) => (usos.data ?? []).filter(filtro).length;
  const [editando, setEditando] = useState<Rascunho | null>(null);

  const salvar = useMutation({
    mutationFn: async (r: Rascunho) => {
      const dados = { nome: r.nome.trim(), descricao: r.descricao.trim() || null, telas: r.telas };
      const { error } = r.id
        ? await supabase.from('perfis_acesso').update(dados).eq('id', r.id)
        : await supabase.from('perfis_acesso').insert({ ...dados, papel_base: r.papel_base });
      if (error) throw error;
    },
    onSuccess: (_, r) => {
      toast.success(r.id ? 'Perfil atualizado. Quem já está logado vê a mudança ao entrar de novo.' : 'Perfil criado. Use em Acessos para dar a um usuário.');
      qc.invalidateQueries({ queryKey: ['perfis_acesso'] });
      setEditando(null);
    },
    onError: (e) => toast.error(traduzir(e)),
  });
  const ativar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('perfis_acesso').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      toast.success(v.ativo ? 'Perfil reativado' : 'Perfil desativado');
      qc.invalidateQueries({ queryKey: ['perfis_acesso'] });
    },
    onError: (e) => toast.error(traduzir(e)),
  });

  return (
    <div className="space-y-4">
      <Cartao
        titulo="Perfis criados"
        acoes={
          <Botao onClick={() => setEditando({ nome: '', descricao: '', papel_base: 'gestao', telas: [], ativo: true })}>+ Novo perfil</Botao>
        }
      >
        <p className="mb-3 text-sm text-slate-500">
          Crie perfis com as telas que cada grupo precisa (ex.: Supervisão de enfermagem, Diretoria, Qualidade). Depois, em <b>Acessos</b>, escolha o
          perfil de cada usuário.
        </p>
        {lista.isLoading ? (
          <Carregando />
        ) : lista.error ? (
          <Erro erro={lista.error} />
        ) : !lista.data?.length ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            Nenhum perfil criado ainda. Clique em <b>+ Novo perfil</b>.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {lista.data.map((p) => (
              <li
                key={p.id}
                className={clsx('rounded-xl border border-slate-200 p-4 dark:border-slate-800', !p.ativo && 'bg-slate-50 opacity-60 dark:bg-slate-900')}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">
                      {p.nome}
                      {!p.ativo && <span className="ml-2 text-xs font-semibold text-slate-500">(desativado)</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      Nível: {NOME_NIVEL[p.papel_base]} · {contar((u) => u.perfil_acesso_id === p.id)} usuário(s)
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      onClick={() => setEditando({ id: p.id, nome: p.nome, descricao: p.descricao ?? '', papel_base: p.papel_base, telas: p.telas, ativo: p.ativo })}
                    >
                      Editar
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" carregando={ativar.isPending} onClick={() => ativar.mutate({ id: p.id, ativo: !p.ativo })}>
                      {p.ativo ? 'Desativar' : 'Reativar'}
                    </Botao>
                  </div>
                </div>
                {p.descricao && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{p.descricao}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {TELAS.filter((t) => p.telas.includes(t.id)).map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full bg-marca-50 px-2 py-0.5 text-xs font-semibold text-marca-700 dark:bg-marca-700/40 dark:text-marca-100"
                    >
                      <Icone nome={t.icone} className="h-3.5 w-3.5" />
                      {t.rotulo}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Perfis padrão do sistema">
        <ul className="grid gap-2 sm:grid-cols-2">
          {PERFIS_PADRAO.map((p) => (
            <li key={p.papel} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <div className="font-semibold">
                {p.nome} <span className="text-xs font-normal text-slate-500">· {contar((u) => u.papel === p.papel && !u.perfil_acesso_id)} usuário(s)</span>
              </div>
              <div className="text-slate-500">{p.descricao}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Os perfis padrão não podem ser editados. Para variar as telas, crie um perfil novo a partir de um deles.</p>
      </Cartao>

      {editando && (
        <Modal aberto aoFechar={() => setEditando(null)} titulo={editando.id ? `Editar perfil ${editando.nome}` : 'Novo perfil'} largura="max-w-2xl">
          <FormPerfil inicial={editando} salvando={salvar.isPending} aoSalvar={(r) => salvar.mutate(r)} />
        </Modal>
      )}
    </div>
  );
}

function FormPerfil({ inicial, salvando, aoSalvar }: { inicial: Rascunho; salvando: boolean; aoSalvar: (r: Rascunho) => void }) {
  const [r, setR] = useState<Rascunho>(inicial);
  const disponiveis = TELAS.filter((t) => TELAS_DO_NIVEL[r.papel_base].includes(t.id));
  const marcar = (id: string, sim: boolean) => setR({ ...r, telas: sim ? [...r.telas, id] : r.telas.filter((t) => t !== id) });
  const valido = r.nome.trim().length >= 2 && r.telas.length > 0;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) aoSalvar(r);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do perfil" htmlFor="pa_nome" obrigatorio>
          <Entrada id="pa_nome" value={r.nome} maxLength={60} placeholder="ex.: Supervisão de enfermagem" onChange={(e) => setR({ ...r, nome: e.target.value })} />
        </Campo>
        <Campo
          rotulo="Nível de permissão"
          htmlFor="pa_nivel"
          dica={r.id ? 'Não muda depois de criado.' : 'Define o que o perfil pode fazer no banco de dados.'}
        >
          <Selecao
            id="pa_nivel"
            value={r.papel_base}
            disabled={!!r.id}
            onChange={(e) => {
              const nivel = e.target.value as NivelPerfil;
              setR({ ...r, papel_base: nivel, telas: TELAS_DO_NIVEL[nivel].length === 1 ? TELAS_DO_NIVEL[nivel] : [] });
            }}
          >
            {(Object.keys(NOME_NIVEL) as NivelPerfil[]).map((n) => (
              <option key={n} value={n}>
                {NOME_NIVEL[n]}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Campo rotulo="Descrição (opcional)" htmlFor="pa_desc">
        <AreaTexto id="pa_desc" rows={2} value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} placeholder="Para quem é este perfil" />
      </Campo>

      <fieldset>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Telas que o perfil enxerga</legend>
          {disponiveis.length > 1 && (
            <div className="flex gap-3 text-sm">
              <button type="button" className="font-semibold text-marca-600 underline" onClick={() => setR({ ...r, telas: disponiveis.map((t) => t.id) })}>
                Marcar todas
              </button>
              <button type="button" className="font-semibold text-slate-500 underline" onClick={() => setR({ ...r, telas: [] })}>
                Limpar
              </button>
            </div>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {disponiveis.map((t) => {
            const marcada = r.telas.includes(t.id);
            return (
              <label
                key={t.id}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition',
                  marcada ? 'border-marca-500 bg-marca-50 dark:bg-marca-700/30' : 'border-slate-200 dark:border-slate-700',
                )}
              >
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-marca-600" checked={marcada} onChange={(e) => marcar(t.id, e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Icone nome={t.icone} className="h-4 w-4" />
                    {t.rotulo}
                  </span>
                  <span className="text-xs text-slate-500">{t.descricao}</span>
                </span>
              </label>
            );
          })}
        </div>
        {r.papel_base === 'gestao' && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            O nível Gestão NIR mantém as permissões da gestão no banco. As telas desmarcadas somem do menu e ficam bloqueadas, e a criação de usuários
            só funciona se a tela Configurações estiver marcada. Use este nível para pessoas de confiança da gestão.
          </p>
        )}
        {r.papel_base === 'setor' && (
          <p className="mt-3 text-xs text-slate-500">O usuário com este perfil vê só os chamados do setor escolhido no cadastro dele, em Acessos.</p>
        )}
      </fieldset>

      <Botao type="submit" disabled={!valido} carregando={salvando}>
        {r.id ? 'Salvar perfil' : 'Criar perfil'}
      </Botao>
    </form>
  );
}

function traduzir(e: unknown) {
  const msg = mensagemErro(e);
  if (/duplicate|perfis_acesso_nome_unico/i.test(msg)) return 'Já existe um perfil com esse nome.';
  return msg;
}
