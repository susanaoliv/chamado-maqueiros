import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Botao, Campo, Carregando, Entrada, Modal, Selecao, Tabela, Vazio } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useMaqueiros } from '@/hooks/dados';
import { mensagemErro } from '@/lib/erros';
import { normalizar } from '@/lib/regras';
import type { Maqueiro } from '@/types/database';

const NOVO: Partial<Maqueiro> = { turno: 'Diurno', horario_inicio: '07:00', horario_fim: '19:00', setor_atuacao: 'Hospital', ativo: true };

/** Quais maqueiros já têm login no app (a gestão enxerga todos os perfis de usuário). */
function useLoginsDoApp() {
  return useQuery({
    queryKey: ['acessos', 'maqueiros'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfis').select('maqueiro_id, ativo').not('maqueiro_id', 'is', null);
      if (error) throw error;
      return new Map(data.map((p) => [p.maqueiro_id as string, p.ativo]));
    },
  });
}

/** Cadastro de maqueiros (nome, matrícula, turno, horário, atuação). Usado em Maqueiros → Cadastro e Escala → Cadastro. */
export function CadastroMaqueiros() {
  const { data: maqueiros = [], isLoading } = useMaqueiros(true);
  const { data: logins } = useLoginsDoApp();
  const [editando, setEditando] = useState<Partial<Maqueiro> | null>(null);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  if (isLoading) return <Carregando />;

  const termo = normalizar(busca);
  const lista = maqueiros.filter((m) => (mostrarInativos || m.ativo) && (!termo || normalizar(`${m.nome} ${m.matricula ?? ''}`).includes(termo)));
  const ativos = maqueiros.filter((m) => m.ativo);
  const situacaoApp = (id: string) => (logins?.has(id) ? (logins.get(id) ? 'Com login' : 'Login bloqueado') : 'Sem login');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Botao onClick={() => setEditando(NOVO)}>+ Novo maqueiro</Botao>
        <Campo rotulo="Buscar" htmlFor="mq_busca" className="min-w-48 flex-1 sm:max-w-xs">
          <Entrada id="mq_busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nome ou matrícula" />
        </Campo>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-marca-600" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
        <p className="ml-auto pb-2 text-sm text-slate-500">
          {ativos.length} ativos · {ativos.filter((m) => m.setor_atuacao === 'CC').length} no CC
        </p>
      </div>

      {lista.length === 0 ? (
        <Vazio>{maqueiros.length ? 'Nenhum maqueiro encontrado.' : 'Nenhum maqueiro cadastrado ainda. Clique em + Novo maqueiro.'}</Vazio>
      ) : (
        <>
          {/* Celular: um cartão por maqueiro */}
          <ul className="space-y-2 md:hidden">
            {lista.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setEditando(m)}
                  className={clsx(
                    'w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900',
                    !m.ativo && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{m.nome}</span>
                    {m.setor_atuacao !== 'Hospital' && <span className="rounded bg-slate-200 px-1.5 text-xs dark:bg-slate-700">{m.setor_atuacao}</span>}
                  </div>
                  <div className="text-slate-500">
                    {m.turno} · {m.horario_inicio.slice(0, 5)}–{m.horario_fim.slice(0, 5)}
                    {m.matricula && ` · mat. ${m.matricula}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {m.ativo ? 'Ativo' : 'Inativo'} · App: {situacaoApp(m.id)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <Tabela className="hidden md:block">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matrícula</th>
                <th>Turno</th>
                <th>Horário</th>
                <th>Atuação</th>
                <th>Situação</th>
                <th>App</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className={!m.ativo ? 'opacity-50' : ''}>
                  <td className="font-semibold">{m.nome}</td>
                  <td>{m.matricula ?? '—'}</td>
                  <td>{m.turno}</td>
                  <td className="whitespace-nowrap">
                    {m.horario_inicio.slice(0, 5)}–{m.horario_fim.slice(0, 5)}
                  </td>
                  <td>{m.setor_atuacao}</td>
                  <td>{!m.ativo ? 'Inativo' : m.em_intervalo ? 'Intervalo' : 'Ativo'}</td>
                  <td className="whitespace-nowrap text-xs">{situacaoApp(m.id)}</td>
                  <td>
                    <Botao tamanho="sm" variante="secundario" onClick={() => setEditando(m)}>
                      Editar
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </>
      )}
      <p className="text-xs text-slate-500">
        O login do app de cada maqueiro é criado em Configurações → Acessos (perfil Maqueiro), ou pelo próprio maqueiro em "Cadastre-se" com aprovação
        da gestão.
      </p>
      {editando && <MaqueiroModal inicial={editando} todos={maqueiros} aoFechar={() => setEditando(null)} />}
    </div>
  );
}

function MaqueiroModal({ inicial, todos, aoFechar }: { inicial: Partial<Maqueiro>; todos: Maqueiro[]; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [m, setM] = useState<Partial<Maqueiro>>({ ...inicial, horario_inicio: inicial.horario_inicio?.slice(0, 5), horario_fim: inicial.horario_fim?.slice(0, 5) });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof Maqueiro, v: unknown) => setM((x) => ({ ...x, [k]: v }));
  const nomeNormal = normalizar(m.nome ?? '');
  const repetido = !!nomeNormal && todos.some((o) => o.id !== m.id && normalizar(o.nome) === nomeNormal);

  const salvar = async () => {
    if (!m.nome?.trim() || m.nome.trim().length < 3) return toast.error('Informe o nome completo');
    if (repetido) return toast.error('Já existe um maqueiro com esse nome. Edite o cadastro que já existe.');
    setSalvando(true);
    const dados = {
      nome: m.nome.trim().replace(/\s+/g, ' ').toUpperCase(),
      matricula: m.matricula?.trim() || null,
      turno: m.turno ?? 'Diurno',
      horario_inicio: m.horario_inicio ?? '07:00',
      horario_fim: m.horario_fim ?? '19:00',
      setor_atuacao: m.setor_atuacao?.trim() || 'Hospital',
      ativo: m.ativo ?? true,
    };
    const { error } = m.id ? await supabase.from('maqueiros').update(dados).eq('id', m.id) : await supabase.from('maqueiros').insert(dados);
    setSalvando(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success(m.id ? 'Cadastro atualizado' : 'Maqueiro cadastrado. Ele já aparece na escala e na tela Maqueiros.');
    qc.invalidateQueries({ queryKey: ['maqueiros'] });
    qc.invalidateQueries({ queryKey: ['painel'] });
    aoFechar();
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={m.id ? `Editar ${inicial.nome}` : 'Novo maqueiro'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Nome completo"
            className="sm:col-span-2"
            htmlFor="mq_nome"
            obrigatorio
            erro={repetido ? 'Já existe um maqueiro com esse nome.' : undefined}
          >
            <Entrada id="mq_nome" value={m.nome ?? ''} onChange={(e) => set('nome', e.target.value)} autoFocus={!m.id} />
          </Campo>
          <Campo rotulo="Matrícula" htmlFor="mq_mat">
            <Entrada id="mq_mat" value={m.matricula ?? ''} onChange={(e) => set('matricula', e.target.value)} />
          </Campo>
          <Campo rotulo="Turno" htmlFor="mq_turno">
            <Selecao
              id="mq_turno"
              value={m.turno}
              onChange={(e) => {
                const turno = e.target.value;
                // Ao trocar o turno de um cadastro novo, sugere o horário padrão do turno
                setM((x) => ({
                  ...x,
                  turno,
                  ...(!x.id && { horario_inicio: turno === 'Noturno' ? '19:00' : '07:00', horario_fim: turno === 'Noturno' ? '07:00' : '19:00' }),
                }));
              }}
            >
              <option>Diurno</option>
              <option>Noturno</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Horário início" htmlFor="mq_ini">
            <Entrada id="mq_ini" type="time" value={m.horario_inicio ?? ''} onChange={(e) => set('horario_inicio', e.target.value)} />
          </Campo>
          <Campo rotulo="Horário fim" htmlFor="mq_fim" dica="Menor que o início = termina no dia seguinte (ex.: 19h–07h).">
            <Entrada id="mq_fim" type="time" value={m.horario_fim ?? ''} onChange={(e) => set('horario_fim', e.target.value)} />
          </Campo>
          <Campo rotulo="Setor de atuação" htmlFor="mq_setor" dica="CC recebe chamados do CC (e do hospital em fins de semana e feriados).">
            <Selecao id="mq_setor" value={m.setor_atuacao} onChange={(e) => set('setor_atuacao', e.target.value)}>
              <option>Hospital</option>
              <option>CC</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Situação" htmlFor="mq_ativo">
            <Selecao id="mq_ativo" value={m.ativo ? '1' : '0'} onChange={(e) => set('ativo', e.target.value === '1')}>
              <option value="1">Ativo</option>
              <option value="0">Inativo (não aparece na escala nem no acionamento)</option>
            </Selecao>
          </Campo>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={salvando} disabled={repetido}>
            {m.id ? 'Salvar' : 'Cadastrar maqueiro'}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
