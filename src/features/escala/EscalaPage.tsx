import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Abas, Botao, Campo, Carregando, Entrada, Erro, Modal, Selecao, Tabela, Vazio } from '@/components/ui';
import { supabase, buscarTudo } from '@/lib/supabase';
import { useMaqueiros } from '@/hooks/dados';
import { proximoTipoEscala, type TipoEscala } from '@/lib/regras';
import { lerCsv, lerGradeEscala, lerXlsx, type LinhaImportada } from '@/lib/importarEscala';
import { hojeLocal, fmtDataHora, DIAS_SEMANA } from '@/lib/tempo';
import { mensagemErro } from '@/lib/erros';
import type { EscalaDia, Habilitacao, Indisponibilidade, Maqueiro } from '@/types/database';

const CORES_ESCALA: Record<string, string> = {
  D: 'bg-sky-500 text-white',
  N: 'bg-indigo-700 text-white',
  E: 'bg-emerald-500 text-white',
  F: 'bg-slate-400 text-white dark:bg-slate-600',
};

function diasDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const n = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => {
    const d = i + 1;
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    return { d, iso, dow: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
  });
}

export function EscalaPage() {
  const [aba, setAba] = useState<'grade' | 'cadastro' | 'registros'>('grade');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Escala dos maqueiros</h1>
        <Abas
          abas={[
            { id: 'grade', rotulo: 'Grade mensal' },
            { id: 'cadastro', rotulo: 'Cadastro' },
            { id: 'registros', rotulo: 'Indisponibilidades e habilitações' },
          ]}
          ativa={aba}
          onChange={setAba}
        />
      </div>
      {aba === 'grade' && <GradeMensal />}
      {aba === 'cadastro' && <CadastroMaqueiros />}
      {aba === 'registros' && <Registros />}
    </div>
  );
}

// ----------------------------------------------------------------------------
function GradeMensal() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(hojeLocal().slice(0, 7));
  const dias = useMemo(() => diasDoMes(mes), [mes]);
  const { data: maqueiros = [] } = useMaqueiros();
  const escala = useQuery({
    queryKey: ['escala', mes],
    queryFn: () =>
      buscarTudo<EscalaDia>((de, ate) =>
        supabase.from('escala_dias').select('*').gte('data', dias[0].iso).lte('data', dias[dias.length - 1].iso).range(de, ate),
      ),
  });
  const mapa = useMemo(() => {
    const m = new Map<string, TipoEscala>();
    (escala.data ?? []).forEach((e) => m.set(`${e.maqueiro_id}|${e.data}`, e.tipo as TipoEscala));
    return m;
  }, [escala.data]);
  const [importando, setImportando] = useState(false);
  const hoje = hojeLocal();

  const alternar = async (maqueiroId: string, data: string) => {
    const atual = mapa.get(`${maqueiroId}|${data}`) ?? null;
    const novo = proximoTipoEscala(atual);
    // atualização otimista
    qc.setQueryData<EscalaDia[]>(['escala', mes], (old = []) => {
      const sem = old.filter((e) => !(e.maqueiro_id === maqueiroId && e.data === data));
      return novo ? [...sem, { id: 'tmp', maqueiro_id: maqueiroId, data, tipo: novo, created_at: '' }] : sem;
    });
    const { error } = await supabase.rpc('definir_escala_dia', { p_maqueiro_id: maqueiroId, p_data: data, p_tipo: novo });
    if (error) toast.error(mensagemErro(error));
    qc.invalidateQueries({ queryKey: ['escala', mes] });
    qc.invalidateQueries({ queryKey: ['painel'] });
  };

  const total = (iso: string) => maqueiros.filter((m) => ['D', 'E'].includes(mapa.get(`${m.id}|${iso}`) ?? '')).length;
  const totalN = (iso: string) => maqueiros.filter((m) => mapa.get(`${m.id}|${iso}`) === 'N').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Mês" htmlFor="mes">
          <Entrada id="mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </Campo>
        <Botao variante="secundario" onClick={() => setImportando(true)}>
          Importar planilha (CSV/Excel)
        </Botao>
        <p className="text-sm text-slate-500">
          Clique na célula para alternar: <strong>D</strong> diurno → <strong>N</strong> noturno (19h–07h) → <strong>E</strong> extra → <strong>F</strong> férias/afastado →
          vazio (folga).
        </p>
      </div>
      {escala.isLoading ? (
        <Carregando />
      ) : escala.error ? (
        <Erro erro={escala.error} />
      ) : (
        <>
          {(escala.data ?? []).length === 0 && (
            <p className="rounded-lg bg-orange-100 p-3 text-sm text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
              Mês sem escala cadastrada: o sistema considera o horário padrão de cada maqueiro todos os dias. Importe a planilha oficial.
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="sticky left-0 z-10 min-w-56 bg-slate-100 px-2 py-1 text-left dark:bg-slate-800">Maqueiro</th>
                  {dias.map((d) => (
                    <th key={d.d} className={clsx('w-7 px-0.5 py-1 text-center', (d.dow === 0 || d.dow === 6) && 'text-red-600', d.iso === hoje && 'bg-yellow-200 dark:bg-yellow-800')}>
                      <div>{d.d}</div>
                      <div className="font-normal">{DIAS_SEMANA[d.dow][0]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maqueiros.map((m) => (
                  <tr key={m.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1 dark:bg-slate-900">
                      <div className="font-semibold">{m.nome}</div>
                      <div className="text-slate-500">
                        {m.horario_inicio.slice(0, 5)}–{m.horario_fim.slice(0, 5)} · {m.setor_atuacao}
                      </div>
                    </td>
                    {dias.map((d) => {
                      const t = mapa.get(`${m.id}|${d.iso}`) ?? null;
                      return (
                        <td key={d.d} className="p-0.5 text-center">
                          <button
                            onClick={() => alternar(m.id, d.iso)}
                            aria-label={`${m.nome} dia ${d.d}: ${t ?? 'folga'}`}
                            className={clsx(
                              'h-7 w-7 rounded font-bold',
                              t ? CORES_ESCALA[t] : 'bg-slate-100 text-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700',
                            )}
                          >
                            {t ?? '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/50">
                  <td className="sticky left-0 bg-slate-50 px-2 py-1 dark:bg-slate-800">Diurno + extra / Noturno</td>
                  {dias.map((d) => (
                    <td key={d.d} className="text-center leading-tight">
                      {total(d.iso)}
                      <br />
                      <span className="text-indigo-700 dark:text-indigo-300">{totalN(d.iso)}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      {importando && <ImportarModal mes={mes} maqueiros={maqueiros} aoFechar={() => setImportando(false)} />}
    </div>
  );
}

function ImportarModal({ mes, maqueiros, aoFechar }: { mes: string; maqueiros: Maqueiro[]; aoFechar: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaImportada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const dias = diasDoMes(mes);

  const ler = async (f: File) => {
    setErro(null);
    try {
      const matriz = /\.xlsx$/i.test(f.name) ? await lerXlsx(await f.arrayBuffer()) : lerCsv(await f.text());
      const r = lerGradeEscala(matriz, maqueiros, dias.length);
      if (!r.length) throw new Error('Nenhum maqueiro encontrado na planilha.');
      setLinhas(r);
      setEscolhas(Object.fromEntries(r.map((l, i) => [i, l.maqueiroId ?? ''])));
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  const confirmar = async () => {
    if (!linhas) return;
    const payload = linhas.flatMap((l, i) => {
      const id = escolhas[i];
      if (!id) return [];
      return dias.map((d) => ({ maqueiro_id: id, data: d.iso, tipo: l.dias[d.d] ?? null }));
    });
    setSalvando(true);
    const { data, error } = await supabase.rpc('importar_escala', { p_linhas: payload, p_mes: `${mes}-01` });
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    toast.success(`Escala importada: ${data} plantões gravados`);
    qc.invalidateQueries({ queryKey: ['escala'] });
    qc.invalidateQueries({ queryKey: ['painel'] });
    aoFechar();
  };

  const naoCasados = linhas?.filter((_, i) => !escolhas[i]).length ?? 0;

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Importar escala de ${mes.split('-').reverse().join('/')}`} largura="max-w-4xl">
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Use a planilha mensal no layout da “ESCALA MAQUEIROS – CASA DE SAÚDE SÃO LUCAS” (nome, horário e uma coluna por dia com D, N, E ou FÉRIAS). A
          importação substitui a escala deste mês dos maqueiros selecionados.
        </p>
        <input ref={input} type="file" accept=".csv,.xlsx" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} className="block text-sm" aria-label="Arquivo da escala" />
        {erro && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {erro}
          </p>
        )}
        {linhas && (
          <>
            <Tabela>
              <thead>
                <tr>
                  <th>Na planilha</th>
                  <th>Horário</th>
                  <th>Maqueiro no sistema</th>
                  <th>D</th>
                  <th>N</th>
                  <th>E</th>
                  <th>F</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const cont = (t: string) => Object.values(l.dias).filter((x) => x === t).length;
                  return (
                    <tr key={i} className={!escolhas[i] ? 'bg-orange-50 dark:bg-orange-950/40' : ''}>
                      <td>{l.nomePlanilha}</td>
                      <td>{l.horario ?? '—'}</td>
                      <td>
                        <Selecao value={escolhas[i] ?? ''} onChange={(e) => setEscolhas({ ...escolhas, [i]: e.target.value })} aria-label={`Maqueiro para ${l.nomePlanilha}`}>
                          <option value="">— ignorar —</option>
                          {maqueiros.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nome}
                            </option>
                          ))}
                        </Selecao>
                      </td>
                      <td>{cont('D')}</td>
                      <td>{cont('N')}</td>
                      <td>{cont('E')}</td>
                      <td>{cont('F')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
            {naoCasados > 0 && (
              <p className="text-sm text-orange-700">
                {naoCasados} linha(s) sem maqueiro correspondente serão ignoradas. Cadastre o maqueiro antes, se necessário.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Botao variante="secundario" onClick={aoFechar}>
                Cancelar
              </Botao>
              <Botao carregando={salvando} onClick={confirmar}>
                Confirmar importação
              </Botao>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
function CadastroMaqueiros() {
  const { data: maqueiros, isLoading } = useMaqueiros(true);
  const [editando, setEditando] = useState<Partial<Maqueiro> | null>(null);
  if (isLoading) return <Carregando />;
  return (
    <div className="space-y-3">
      <Botao onClick={() => setEditando({ turno: 'Diurno', horario_inicio: '07:00', horario_fim: '19:00', setor_atuacao: 'Hospital', ativo: true })}>
        + Novo maqueiro
      </Botao>
      <Tabela>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Matrícula</th>
            <th>Turno</th>
            <th>Horário</th>
            <th>Atuação</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(maqueiros ?? []).map((m) => (
            <tr key={m.id} className={!m.ativo ? 'opacity-50' : ''}>
              <td className="font-semibold">{m.nome}</td>
              <td>{m.matricula ?? '—'}</td>
              <td>{m.turno}</td>
              <td>
                {m.horario_inicio.slice(0, 5)}–{m.horario_fim.slice(0, 5)}
              </td>
              <td>{m.setor_atuacao}</td>
              <td>{!m.ativo ? 'Inativo' : m.em_intervalo ? 'Intervalo' : 'Ativo'}</td>
              <td>
                <Botao tamanho="sm" variante="secundario" onClick={() => setEditando(m)}>
                  Editar
                </Botao>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      {editando && <MaqueiroModal inicial={editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}

function MaqueiroModal({ inicial, aoFechar }: { inicial: Partial<Maqueiro>; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [m, setM] = useState<Partial<Maqueiro>>({ ...inicial, horario_inicio: inicial.horario_inicio?.slice(0, 5), horario_fim: inicial.horario_fim?.slice(0, 5) });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof Maqueiro, v: unknown) => setM((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    if (!m.nome?.trim()) return toast.error('Informe o nome');
    setSalvando(true);
    const dados = {
      nome: m.nome.trim().toUpperCase(),
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
    toast.success('Maqueiro salvo');
    qc.invalidateQueries({ queryKey: ['maqueiros'] });
    qc.invalidateQueries({ queryKey: ['painel'] });
    aoFechar();
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={m.id ? `Editar ${inicial.nome}` : 'Novo maqueiro'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" className="sm:col-span-2" htmlFor="mq_nome">
          <Entrada id="mq_nome" value={m.nome ?? ''} onChange={(e) => set('nome', e.target.value)} />
        </Campo>
        <Campo rotulo="Matrícula" htmlFor="mq_mat">
          <Entrada id="mq_mat" value={m.matricula ?? ''} onChange={(e) => set('matricula', e.target.value)} />
        </Campo>
        <Campo rotulo="Turno" htmlFor="mq_turno">
          <Selecao id="mq_turno" value={m.turno} onChange={(e) => set('turno', e.target.value)}>
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
        <Campo rotulo="Setor de atuação" htmlFor="mq_setor">
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
        <Botao variante="secundario" onClick={aoFechar}>
          Voltar
        </Botao>
        <Botao carregando={salvando} onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
function Registros() {
  const { data: maqueiros = [] } = useMaqueiros(true);
  const nome = (id: string) => maqueiros.find((m) => m.id === id)?.nome ?? '—';
  const ind = useQuery({
    queryKey: ['indisponibilidades', 'lista'],
    queryFn: async () => {
      const { data, error } = await supabase.from('indisponibilidades').select('*').order('inicio', { ascending: false }).limit(300);
      if (error) throw error;
      return data as Indisponibilidade[];
    },
  });
  const hab = useQuery({
    queryKey: ['habilitacoes', 'lista'],
    queryFn: async () => {
      const { data, error } = await supabase.from('habilitacoes').select('*').order('criado_em', { ascending: false }).limit(300);
      if (error) throw error;
      return data as Habilitacao[];
    },
  });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section>
        <h2 className="mb-2 font-bold">Indisponibilidades</h2>
        {ind.isLoading ? (
          <Carregando />
        ) : !ind.data?.length ? (
          <Vazio>Nenhuma indisponibilidade registrada.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Maqueiro</th>
                <th>Motivo</th>
                <th>Justificativa</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {ind.data.map((i) => (
                <tr key={i.id}>
                  <td>{nome(i.maqueiro_id)}</td>
                  <td>{i.tipo}</td>
                  <td>{i.justificativa}</td>
                  <td>{fmtDataHora(i.inicio)}</td>
                  <td>{i.fim ? fmtDataHora(i.fim) : <strong className="text-red-600">em aberto</strong>}</td>
                  <td className="text-xs">
                    {i.criado_por}
                    {i.encerrado_por && <> / {i.encerrado_por}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-bold">Habilitações (trocas, coberturas, extras)</h2>
        {hab.isLoading ? (
          <Carregando />
        ) : !hab.data?.length ? (
          <Vazio>Nenhuma habilitação registrada.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Maqueiro</th>
                <th>Data</th>
                <th>Horário</th>
                <th>Motivo</th>
                <th>Obs.</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {hab.data.map((h) => (
                <tr key={h.id} className={h.removido_em ? 'line-through opacity-60' : ''}>
                  <td>{nome(h.maqueiro_id)}</td>
                  <td>{h.data.split('-').reverse().join('/')}</td>
                  <td>
                    {h.hora_inicio.slice(0, 5)}–{h.hora_fim.slice(0, 5)}
                  </td>
                  <td>{h.motivo}</td>
                  <td>{h.observacao ?? ''}</td>
                  <td className="text-xs">{h.criado_por}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
    </div>
  );
}
