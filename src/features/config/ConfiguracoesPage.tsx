import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Abas, AreaTexto, Botao, Cartao, Campo, Carregando, Entrada, Erro, Modal, Selecao, Tabela } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useConfig, useMaqueiros, useSetores } from '@/hooks/dados';
import { mensagemErro } from '@/lib/erros';
import { normalizar } from '@/lib/regras';
import type { Json, Perfil, Setor } from '@/types/database';

export function ConfiguracoesPage() {
  const [aba, setAba] = useState<'geral' | 'app' | 'setores' | 'acessos'>('geral');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Configurações</h1>
        <Abas
          abas={[
            { id: 'geral', rotulo: 'Parâmetros' },
            { id: 'app', rotulo: 'App dos maqueiros' },
            { id: 'setores', rotulo: 'Setores' },
            { id: 'acessos', rotulo: 'Acessos' },
          ]}
          ativa={aba}
          onChange={setAba}
        />
      </div>
      {aba === 'geral' && <Parametros />}
      {aba === 'app' && <ConfigApp />}
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
  const { data: maqueiros = [] } = useMaqueiros();
  const maqueiroNome = (id: string | null) => maqueiros.find((m) => m.id === id)?.nome ?? '';
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
  const [editando, setEditando] = useState<(Perfil & { aprovar?: boolean }) | null>(null);
  const pendentes = (lista.data ?? []).filter((p) => !p.ativo && !p.aprovado_em);
  const demais = (lista.data ?? []).filter((p) => p.ativo || p.aprovado_em);
  const NOME_PAPEL: Record<string, string> = { gestao: 'Gestão NIR', telefonista: 'Telefonista', setor: 'Enfermagem', maqueiro: 'Maqueiro' };

  return (
    <div className="space-y-4">
      {pendentes.length > 0 && (
        <Cartao titulo={`⏳ Cadastros aguardando aprovação (${pendentes.length})`}>
          <Tabela>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Perfil pedido</th>
                <th>Setor</th>
                <th>Pedido em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.nome}</td>
                  <td className="font-mono">{p.usuario}</td>
                  <td>{NOME_PAPEL[p.papel] ?? p.papel}</td>
                  <td>{setorNome(p.setor_id) || maqueiroNome(p.maqueiro_id)}</td>
                  <td className="whitespace-nowrap">{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                  <td className="flex gap-2">
                    <Botao tamanho="sm" variante="sucesso" onClick={() => setEditando({ ...p, aprovar: true })}>
                      Aprovar
                    </Botao>
                    <Botao tamanho="sm" variante="secundario" onClick={() => acao.mutate({ acao: 'ativar', usuario: p.usuario, ativo: false })}>
                      Recusar
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
      )}

      <Cartao titulo="Criar acesso">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Perfil" htmlFor="ac_papel">
            <Selecao id="ac_papel" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}>
              <option value="setor">Setor (enfermagem)</option>
              <option value="telefonista">Telefonista</option>
              <option value="gestao">Gestão NIR</option>
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
            {demais.map((p) => (
              <tr key={p.id} className={!p.ativo ? 'opacity-50' : ''}>
                <td className="font-mono">{p.usuario}</td>
                <td>{NOME_PAPEL[p.papel] ?? p.papel}</td>
                <td>{p.nome}</td>
                <td>{setorNome(p.setor_id) || maqueiroNome(p.maqueiro_id)}</td>
                <td>{p.ativo ? 'Ativo' : 'Bloqueado'}</td>
                <td className="flex gap-2">
                  <Botao tamanho="sm" variante="secundario" onClick={() => setEditando(p)}>
                    Perfil
                  </Botao>
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

      {editando && (
        <Modal aberto aoFechar={() => setEditando(null)} titulo={editando.aprovar ? `Aprovar ${editando.nome}` : `Perfil de ${editando.usuario}`}>
          <PerfilForm
            inicial={editando}
            setores={setores.filter((s) => s.ativo)}
            maqueiros={maqueiros}
            textoBotao={editando.aprovar ? 'Aprovar acesso' : 'Salvar'}
            aoSalvar={async (v) => {
              try {
                await adminUsuarios({ acao: 'alterar', usuario: editando.usuario, ...v });
                if (editando.aprovar) await adminUsuarios({ acao: 'ativar', usuario: editando.usuario, ativo: true });
                toast.success(editando.aprovar ? 'Acesso aprovado' : 'Perfil atualizado');
                qc.invalidateQueries({ queryKey: ['acessos'] });
                setEditando(null);
              } catch (e) {
                toast.error(mensagemErro(e));
              }
            }}
          />
        </Modal>
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

function PerfilForm({
  inicial,
  setores,
  maqueiros,
  textoBotao,
  aoSalvar,
}: {
  inicial: Perfil;
  setores: Setor[];
  maqueiros: { id: string; nome: string }[];
  textoBotao: string;
  aoSalvar: (v: { papel: string; setor_id: string | null; maqueiro_id: string | null; nome: string }) => Promise<void>;
}) {
  const [papel, setPapel] = useState(inicial.papel);
  const [setorId, setSetorId] = useState(inicial.setor_id ?? '');
  const [maqueiroId, setMaqueiroId] = useState(inicial.maqueiro_id ?? '');
  const [nome, setNome] = useState(inicial.nome);
  const [salvando, setSalvando] = useState(false);
  const valido = nome.trim().length >= 2 && (papel !== 'setor' || !!setorId) && (papel !== 'maqueiro' || !!maqueiroId);
  return (
    <div className="space-y-3">
      <Campo rotulo="Nome" htmlFor="pf_nome">
        <Entrada id="pf_nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="Perfil" htmlFor="pf_papel">
        <Selecao id="pf_papel" value={papel} onChange={(e) => setPapel(e.target.value)}>
          <option value="setor">Setor (enfermagem)</option>
          <option value="telefonista">Telefonista</option>
          <option value="maqueiro">Maqueiro (app)</option>
          <option value="gestao">Gestão NIR</option>
        </Selecao>
      </Campo>
      {papel === 'maqueiro' && (
        <Campo rotulo="Maqueiro da escala" htmlFor="pf_maqueiro">
          <Selecao id="pf_maqueiro" value={maqueiroId} onChange={(e) => setMaqueiroId(e.target.value)}>
            <option value="">Selecione…</option>
            {maqueiros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      )}
      {papel === 'setor' && (
        <Campo rotulo="Setor" htmlFor="pf_setor">
          <Selecao id="pf_setor" value={setorId} onChange={(e) => setSetorId(e.target.value)}>
            <option value="">Selecione…</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      )}
      <Botao
        disabled={!valido}
        carregando={salvando}
        onClick={async () => {
          setSalvando(true);
          await aoSalvar({
            papel,
            setor_id: papel === 'setor' ? setorId : null,
            maqueiro_id: papel === 'maqueiro' ? maqueiroId : null,
            nome: nome.trim(),
          });
          setSalvando(false);
        }}
      >
        {textoBotao}
      </Botao>
    </div>
  );
}

// ----------------------------------------------------------------------------
// App dos maqueiros: distribuição automática, tempo de aceite, local do hospital, feriados
// ----------------------------------------------------------------------------
function ConfigApp() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ['config', 'app'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes')
        .select('*')
        .in('chave', ['despacho_automatico', 'oferta_timeout_s', 'hospital_lat', 'hospital_lng', 'hospital_raio_m', 'feriados']);
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.chave, r.valor])) as Record<string, unknown>;
    },
  });
  const [v, setV] = useState({ automatico: true, timeout: '90', lat: '', lng: '', raio: '300', feriados: '' });
  const [localizando, setLocalizando] = useState(false);
  useEffect(() => {
    const c = cfg.data;
    if (!c) return;
    setV({
      automatico: c.despacho_automatico !== false,
      timeout: String(c.oferta_timeout_s ?? 90),
      lat: c.hospital_lat == null ? '' : String(c.hospital_lat),
      lng: c.hospital_lng == null ? '' : String(c.hospital_lng),
      raio: String(c.hospital_raio_m ?? 300),
      feriados: ((c.feriados as string[]) ?? []).map((d) => d.split('-').reverse().join('/')).join('\n'),
    });
  }, [cfg.data]);

  const usarLocalAtual = () => {
    if (!navigator.geolocation) return toast.error('Este aparelho não informa a localização.');
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setV((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }));
        toast.success(`Localização capturada (precisão de ${Math.round(p.coords.accuracy)} m). Confira no mapa e salve.`);
        setLocalizando(false);
      },
      () => {
        toast.error('Não foi possível obter a localização. Permita o acesso no navegador.');
        setLocalizando(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const timeout = Number(v.timeout);
      const raio = Number(v.raio);
      const lat = v.lat.trim() ? Number(v.lat.replace(',', '.')) : null;
      const lng = v.lng.trim() ? Number(v.lng.replace(',', '.')) : null;
      if (!(timeout >= 30 && timeout <= 600)) throw new Error('O tempo para aceitar deve ficar entre 30 e 600 segundos.');
      if (!(raio >= 50 && raio <= 2000)) throw new Error('O raio deve ficar entre 50 e 2000 metros.');
      if ((lat === null) !== (lng === null) || (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng!) > 180 || Number.isNaN(lat) || Number.isNaN(lng))))
        throw new Error('Latitude/longitude inválidas.');
      const feriados: string[] = [];
      for (const linha of v.feriados.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
        const m = linha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) throw new Error(`Feriado inválido: "${linha}". Use dd/mm/aaaa, um por linha.`);
        feriados.push(`${m[3]}-${m[2]}-${m[1]}`);
      }
      const linhas: { chave: string; valor: Json }[] = [
        { chave: 'despacho_automatico', valor: v.automatico },
        { chave: 'oferta_timeout_s', valor: timeout },
        { chave: 'hospital_raio_m', valor: raio },
        { chave: 'feriados', valor: [...new Set(feriados)].sort() },
      ];
      // a coluna valor não aceita nulo: o local só é gravado quando informado
      if (lat !== null && lng !== null) linhas.push({ chave: 'hospital_lat', valor: lat }, { chave: 'hospital_lng', valor: lng });
      const { error } = await supabase.from('configuracoes').upsert(linhas);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configurações do app salvas');
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  if (cfg.isLoading) return <Carregando />;
  const temLocal = v.lat && v.lng;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Cartao titulo="Distribuição automática">
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={v.automatico} onChange={(e) => setV({ ...v, automatico: e.target.checked })} />
            <span>
              <strong>Enviar chamados automaticamente para o app</strong>
              <span className="block text-sm text-slate-500">
                O chamado vai para o maqueiro livre há mais tempo (urgente: para todos os livres). Desligado, a Central distribui como antes.
              </span>
            </span>
          </label>
          <Campo rotulo="Tempo para aceitar (segundos)" htmlFor="app_timeout" dica="Passado esse tempo, o chamado vai para o próximo da fila.">
            <Entrada id="app_timeout" type="number" min={30} max={600} value={v.timeout} onChange={(e) => setV({ ...v, timeout: e.target.value })} />
          </Campo>
          <Campo rotulo="Feriados (o CC recebe chamados do hospital)" htmlFor="app_feriados" dica="Um por linha, no formato dd/mm/aaaa. Sábados e domingos já contam automaticamente.">
            <AreaTexto id="app_feriados" rows={8} value={v.feriados} onChange={(e) => setV({ ...v, feriados: e.target.value })} />
          </Campo>
        </div>
      </Cartao>
      <Cartao titulo="Local do hospital (para iniciar a jornada)">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            O maqueiro só consegue iniciar a jornada se o GPS do celular estiver dentro deste raio. Estando no hospital, toque em “Usar minha localização atual”.
          </p>
          <Botao variante="secundario" carregando={localizando} onClick={usarLocalAtual}>
            📍 Usar minha localização atual
          </Botao>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Latitude" htmlFor="app_lat">
              <Entrada id="app_lat" inputMode="decimal" value={v.lat} onChange={(e) => setV({ ...v, lat: e.target.value })} placeholder="-5.8…" />
            </Campo>
            <Campo rotulo="Longitude" htmlFor="app_lng">
              <Entrada id="app_lng" inputMode="decimal" value={v.lng} onChange={(e) => setV({ ...v, lng: e.target.value })} placeholder="-35.2…" />
            </Campo>
          </div>
          <Campo rotulo="Raio permitido (metros)" htmlFor="app_raio" dica="300 m cobre o prédio e o estacionamento com folga para a imprecisão do GPS.">
            <Entrada id="app_raio" type="number" min={50} max={2000} value={v.raio} onChange={(e) => setV({ ...v, raio: e.target.value })} />
          </Campo>
          {temLocal ? (
            <a
              className="text-sm text-marca-600 underline"
              href={`https://www.google.com/maps?q=${v.lat.replace(',', '.')},${v.lng.replace(',', '.')}`}
              target="_blank"
              rel="noreferrer"
            >
              Conferir o ponto no mapa
            </a>
          ) : (
            <p className="text-sm font-semibold text-orange-700">Local ainda não configurado: os maqueiros não conseguem iniciar a jornada.</p>
          )}
        </div>
      </Cartao>
      <div className="lg:col-span-2">
        <Botao onClick={() => salvar.mutate()} carregando={salvar.isPending}>
          Salvar configurações do app
        </Botao>
      </div>
    </div>
  );
}
