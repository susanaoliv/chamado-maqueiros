import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AreaTexto, Botao, Campo, Carregando, Entrada, Erro, Modal, Selecao, Selo } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { mensagemErro, exigeMotivoAtrasoErro } from '@/lib/erros';
import { agora as agoraServidor, definirOffsetServidor, fmtDuracao, fmtHora, minutosEntre } from '@/lib/tempo';
import { MOTIVOS_ATRASO } from '@/lib/constantes';
import { useAuth } from '@/features/auth/AuthProvider';
import { segundosRestantes } from './oferta';

type ChamadoApp = {
  id: string; numero: string; aberto_em: string; tipo: string; prioridade: string; recurso: string;
  precisa_isolamento: boolean; precisa_oxigenio: boolean; observacao: string | null; status: string;
  setor_origem: string; leito_origem: string | null; setor_destino: string | null; leito_destino: string | null;
  paciente: string | null; maqueiro_informado_em: string | null; inicio_atendimento_em: string | null;
};
type OfertaApp = { id: string; enviada_em: string; expira_em: string; urgente: boolean; chamado: ChamadoApp };
type EstadoApp = {
  agora: string; sla_minutos: number; oferta_timeout_s: number; hospital_configurado: boolean;
  maqueiro: { id: string; nome: string; setor_atuacao: string; horario_inicio: string; horario_fim: string };
  em_plantao: boolean; indisponivel: boolean;
  jornada: { id: string; inicio: string } | null;
  intervalo: { id: string; inicio: string } | null;
  ofertas: OfertaApp[];
  chamado_ativo: ChamadoApp | null;
  hoje: { concluidos: number; minutos: number };
  recusas_hoje: number;
};

const ETAPAS: Record<string, { rotulo: string; proxima?: { status: string; texto: string } }> = {
  maqueiro_acionado: { rotulo: 'Indo até o paciente', proxima: { status: 'em_atendimento', texto: 'CHEGUEI · INICIAR TRANSPORTE' } },
  em_atendimento: { rotulo: 'Em transporte' },
  aguardando_enfermagem: { rotulo: 'Aguardando enfermagem', proxima: { status: 'em_atendimento', texto: 'RETOMAR TRANSPORTE' } },
  aguardando_maca: { rotulo: 'Aguardando maca', proxima: { status: 'em_atendimento', texto: 'RETOMAR TRANSPORTE' } },
};

// ---------------------------------------------------------------------------
// Alerta sonoro + vibração (precisa de um toque do usuário para liberar o som)
// ---------------------------------------------------------------------------
function useAlerta() {
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liberado, setLiberado] = useState(false);

  const liberar = useCallback(() => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!ctx.current && AC) ctx.current = new AC();
      void ctx.current?.resume();
      setLiberado(true);
    } catch {
      /* sem áudio */
    }
  }, []);

  const bipe = useCallback(() => {
    const c = ctx.current;
    if (c) {
      for (const [atraso, freq] of [[0, 880], [0.25, 1175]] as const) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, c.currentTime + atraso);
        g.gain.exponentialRampToValueAtTime(0.4, c.currentTime + atraso + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + atraso + 0.2);
        o.connect(g).connect(c.destination);
        o.start(c.currentTime + atraso);
        o.stop(c.currentTime + atraso + 0.22);
      }
    }
    navigator.vibrate?.([300, 150, 300]);
  }, []);

  const tocar = useCallback(
    (ligado: boolean) => {
      if (ligado && !timer.current) {
        bipe();
        timer.current = setInterval(bipe, 2000);
      }
      if (!ligado && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    },
    [bipe],
  );
  useEffect(() => () => tocar(false), [tocar]);
  return { liberado, liberar, tocar };
}

// Mantém a tela acesa durante a jornada (quando o navegador permite)
function useTelaAcesa(ativo: boolean) {
  useEffect(() => {
    if (!ativo || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
      } catch {
        /* sem permissão */
      }
    };
    void pedir();
    const aoVoltar = () => document.visibilityState === 'visible' && void pedir();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      void lock?.release();
    };
  }, [ativo]);
}

function useRelogio(ms = 1000) {
  const [t, setT] = useState(agoraServidor());
  useEffect(() => {
    const id = setInterval(() => setT(agoraServidor()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, (args ?? {}) as never);
  if (error) throw error;
  return data as T;
}

function obterPosicao(): Promise<GeolocationPosition> {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error('Este celular não informa a localização.'));
    navigator.geolocation.getCurrentPosition(ok, (e) => falha(new Error(e.code === 1 ? 'Permita o acesso à localização para iniciar a jornada.' : 'Não foi possível obter a localização. Tente de novo.')), {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

// ---------------------------------------------------------------------------
export function AppMaqueiroPage() {
  const qc = useQueryClient();
  const { sair, perfil } = useAuth();
  const agora = useRelogio(1000);
  const { liberado, liberar, tocar } = useAlerta();

  const estado = useQuery({
    queryKey: ['app-estado'],
    queryFn: async () => {
      const enviado = Date.now();
      const e = await rpc<EstadoApp>('app_maqueiro_estado');
      definirOffsetServidor(e.agora, enviado, Date.now());
      return e;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // tempo real: nova oferta chega na hora (o intervalo de 5 s é a garantia)
  useEffect(() => {
    const canal = supabase
      .channel('app-maqueiro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ofertas' }, () => qc.invalidateQueries({ queryKey: ['app-estado'] }))
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  const e = estado.data;
  const ofertas = (e?.ofertas ?? []).filter((o) => segundosRestantes(o.expira_em, agora) > 0);
  useEffect(() => tocar(ofertas.length > 0), [ofertas.length, tocar]);
  useTelaAcesa(!!e?.jornada);

  const acao = useMutation({
    mutationFn: ({ nome, args }: { nome: string; args?: Record<string, unknown> }) => rpc(nome, args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-estado'] }),
  });
  const executar = async (nome: string, args?: Record<string, unknown>, sucesso?: string) => {
    try {
      await acao.mutateAsync({ nome, args });
      if (sucesso) toast.success(sucesso);
      return true;
    } catch (err) {
      toast.error(mensagemErro(err));
      return false;
    }
  };

  const [iniciando, setIniciando] = useState(false);
  const iniciarJornada = async () => {
    liberar();
    setIniciando(true);
    try {
      const pos = await obterPosicao();
      await executar('iniciar_jornada', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_precisao: pos.coords.accuracy }, 'Jornada iniciada. Bom plantão!');
    } catch (err) {
      toast.error(mensagemErro(err));
    } finally {
      setIniciando(false);
    }
  };

  const [recusando, setRecusando] = useState<OfertaApp | null>(null);
  const [concluindo, setConcluindo] = useState<ChamadoApp | null>(null);

  if (estado.isLoading) return <Carregando texto="Abrindo o app…" />;
  if (estado.error) return <div className="p-4"><Erro erro={estado.error} /></div>;
  if (!e) return null;

  const ativo = e.chamado_ativo;
  const etapa = ativo ? ETAPAS[ativo.status] : null;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 pb-10 dark:bg-slate-950" onClick={() => !liberado && liberar()}>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <img src="/favicon.svg" alt="" className="h-9 w-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-bold">{e.maqueiro.nome}</div>
          <div className="text-xs text-slate-500">
            {e.jornada ? `Em jornada desde ${fmtHora(e.jornada.inicio)}` : 'Fora de jornada'}
            {e.maqueiro.setor_atuacao !== 'Hospital' && ` · ${e.maqueiro.setor_atuacao}`}
          </div>
        </div>
        <button onClick={() => sair()} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          Sair
        </button>
      </header>

      <main className="space-y-4 p-4">
        {!liberado && e.jornada && (
          <button onClick={liberar} className="w-full rounded-lg bg-yellow-100 p-3 text-sm font-semibold text-yellow-900">
            🔔 Toque aqui para ativar o som dos chamados
          </button>
        )}

        {/* Ofertas recebidas */}
        {ofertas.map((o) => {
          const s = segundosRestantes(o.expira_em, agora);
          const total = e.oferta_timeout_s || 90;
          return (
            <section key={o.id} className={clsx('overflow-hidden rounded-2xl border-2 bg-white shadow-lg dark:bg-slate-900', o.urgente ? 'border-red-500' : 'border-marca-500')} data-testid="oferta">
              <div className="h-2 bg-slate-200 dark:bg-slate-800">
                <div className={clsx('h-2 transition-all', s <= 20 ? 'bg-red-500' : 'bg-marca-500')} style={{ width: `${Math.min(100, (s / total) * 100)}%` }} />
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black">{o.urgente ? '🚨 CHAMADO URGENTE' : '🔔 NOVO CHAMADO'}</span>
                  <span className={clsx('text-2xl font-black tabular-nums', s <= 20 && 'text-red-600')}>{s}s</span>
                </div>
                <ResumoChamado c={o.chamado} />
                <div className="grid grid-cols-3 gap-2">
                  <Botao variante="secundario" tamanho="lg" onClick={() => setRecusando(o)}>
                    Recusar
                  </Botao>
                  <Botao
                    variante="sucesso"
                    tamanho="xl"
                    className="col-span-2"
                    carregando={acao.isPending}
                    onClick={() => executar('aceitar_oferta', { p_oferta_id: o.id }, `Você assumiu o ${o.chamado.numero}`)}
                  >
                    ACEITAR
                  </Botao>
                </div>
              </div>
            </section>
          );
        })}

        {/* Chamado em andamento */}
        {ativo && etapa && (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <Selo className="bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100">{etapa.rotulo}</Selo>
              <span className="text-sm tabular-nums text-slate-500">{fmtDuracao(minutosEntre(ativo.aberto_em, agora))} desde a abertura</span>
            </div>
            <ResumoChamado c={ativo} />
            {etapa.proxima && (
              <Botao tamanho="xl" className="w-full" carregando={acao.isPending} onClick={() => executar('mudar_status', { p_chamado_id: ativo.id, p_status: etapa.proxima!.status })}>
                {etapa.proxima.texto}
              </Botao>
            )}
            {ativo.status === 'em_atendimento' && (
              <div className="grid grid-cols-2 gap-2">
                <Botao variante="secundario" onClick={() => executar('mudar_status', { p_chamado_id: ativo.id, p_status: 'aguardando_enfermagem' })}>
                  Aguardando enfermagem
                </Botao>
                <Botao variante="secundario" onClick={() => executar('mudar_status', { p_chamado_id: ativo.id, p_status: 'aguardando_maca' })}>
                  Aguardando maca
                </Botao>
              </div>
            )}
            <Botao variante="sucesso" tamanho="xl" className="w-full" onClick={() => setConcluindo(ativo)}>
              CONCLUIR CHAMADO
            </Botao>
          </section>
        )}

        {/* Jornada */}
        {!e.jornada ? (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-slate-600 dark:text-slate-300">Ao chegar ao hospital, inicie a jornada para começar a receber chamados.</p>
            {!e.em_plantao && (
              <p className="rounded-lg bg-orange-100 p-3 text-sm text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
                Você não está na escala deste horário. Se for troca ou cobertura, peça para a Central te habilitar.
              </p>
            )}
            {!e.hospital_configurado && (
              <p className="rounded-lg bg-orange-100 p-3 text-sm text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
                A localização do hospital ainda não foi configurada pela gestão.
              </p>
            )}
            <Botao tamanho="xl" className="w-full" carregando={iniciando} onClick={iniciarJornada} disabled={!e.em_plantao}>
              INICIAR JORNADA
            </Botao>
            <p className="text-xs text-slate-500">O app confere pelo GPS se você está no hospital.</p>
          </section>
        ) : (
          !ativo &&
          ofertas.length === 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
              {e.intervalo ? (
                <>
                  <div className="text-4xl">☕</div>
                  <div className="mt-1 text-lg font-bold">Em intervalo</div>
                  <div className="text-sm text-slate-500">
                    desde {fmtHora(e.intervalo.inicio)} · {fmtDuracao(minutosEntre(e.intervalo.inicio, agora))}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Você não recebe chamados durante o intervalo.</p>
                </>
              ) : e.indisponivel ? (
                <>
                  <div className="text-4xl">⛔</div>
                  <div className="mt-1 text-lg font-bold">Marcado como indisponível pela Central</div>
                </>
              ) : (
                <>
                  <div className="text-4xl">🟢</div>
                  <div className="mt-1 text-lg font-bold">Livre · aguardando chamado</div>
                  <p className="text-sm text-slate-500">Mantenha o app aberto. O chamado aparece aqui com som e vibração.</p>
                </>
              )}
            </section>
          )
        )}

        {e.jornada && !ativo && ofertas.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Botao
              variante="secundario"
              tamanho="lg"
              onClick={() => executar('definir_intervalo', { p_maqueiro_id: e.maqueiro.id, p_em_intervalo: !e.intervalo }, e.intervalo ? 'Bom retorno!' : 'Bom intervalo!')}
            >
              {e.intervalo ? 'Voltar do intervalo' : 'Iniciar intervalo'}
            </Botao>
            <Botao
              variante="perigo"
              tamanho="lg"
              onClick={() => window.confirm('Encerrar sua jornada? Você deixa de receber chamados.') && executar('encerrar_jornada', {}, 'Jornada encerrada. Bom descanso!')}
            >
              Encerrar jornada
            </Botao>
          </div>
        )}

        <section className="grid grid-cols-3 gap-2 text-center">
          <Indicador titulo="Concluídos hoje" valor={e.hoje.concluidos} />
          <Indicador titulo="Min em chamados" valor={e.hoje.minutos} />
          <Indicador titulo="Recusas hoje" valor={e.recusas_hoje} />
        </section>
        <p className="text-center text-xs text-slate-400">{perfil?.usuario} · atualiza sozinho</p>
      </main>

      {recusando && (
        <RecusaModal
          oferta={recusando}
          aoFechar={() => setRecusando(null)}
          aoConfirmar={async (j) => (await executar('recusar_oferta', { p_oferta_id: recusando.id, p_justificativa: j }, 'Recusa registrada')) && setRecusando(null)}
        />
      )}
      {concluindo && (
        <ConcluirModal
          c={concluindo}
          sla={e.sla_minutos}
          agora={agora}
          aoFechar={() => setConcluindo(null)}
          aoConfirmar={async (motivo, texto) => {
            try {
              await acao.mutateAsync({ nome: 'encerrar_chamado', args: { p_chamado_id: concluindo.id, p_motivo_atraso: motivo || null, p_motivo_atraso_texto: texto || null } });
              toast.success(`${concluindo.numero} concluído`);
              setConcluindo(null);
            } catch (err) {
              toast.error(exigeMotivoAtrasoErro(err) ? 'Passou do prazo: informe o motivo do atraso.' : mensagemErro(err));
            }
          }}
        />
      )}
    </div>
  );
}

function ResumoChamado({ c }: { c: ChamadoApp }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-bold">{c.numero}</span>
        <Selo className={c.prioridade === 'Urgente' ? 'bg-red-600 text-white' : c.prioridade === 'Prioritário' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100'}>
          {c.prioridade}
        </Selo>
        <span className="text-slate-500">aberto às {fmtHora(c.aberto_em)}</span>
      </div>
      <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
        <div className="text-xs uppercase text-slate-500">Buscar em</div>
        <div className="text-xl font-bold">
          {c.setor_origem}
          {c.leito_origem && <span className="font-normal"> · leito {c.leito_origem}</span>}
        </div>
        <div className="mt-2 text-xs uppercase text-slate-500">Levar para</div>
        <div className="text-xl font-bold">
          {c.setor_destino ?? 'Alta (saída)'}
          {c.leito_destino && <span className="font-normal"> · leito {c.leito_destino}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span>
          <strong>{c.tipo}</strong> · {c.recurso}
        </span>
        {c.paciente && <span>Paciente: {c.paciente}</span>}
      </div>
      {(c.precisa_isolamento || c.precisa_oxigenio) && (
        <div className="flex gap-2">
          {c.precisa_isolamento && <Selo className="bg-orange-500 text-white">⚠ ISOLAMENTO</Selo>}
          {c.precisa_oxigenio && <Selo className="bg-sky-600 text-white">⚠ OXIGÊNIO</Selo>}
        </div>
      )}
      {c.observacao && <p className="rounded bg-yellow-50 px-2 py-1 text-sm dark:bg-yellow-900/30">Obs.: {c.observacao}</p>}
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900">
      <div className="text-2xl font-bold tabular-nums">{valor}</div>
      <div className="text-xs text-slate-500">{titulo}</div>
    </div>
  );
}

const MOTIVOS_RECUSA = ['Em outro atendimento', 'Banheiro / necessidade pessoal', 'Longe do setor', 'Sem maca/cadeira disponível', 'Problema de saúde', 'Outro'];

function RecusaModal({ oferta, aoFechar, aoConfirmar }: { oferta: OfertaApp; aoFechar: () => void; aoConfirmar: (j: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const justificativa = motivo === 'Outro' ? texto.trim() : [motivo, texto.trim()].filter(Boolean).join(': ');
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Recusar ${oferta.chamado.numero}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">O chamado passa para o próximo maqueiro da fila. A recusa fica registrada.</p>
        <Campo rotulo="Motivo" obrigatorio htmlFor="rec_motivo">
          <Selecao id="rec_motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus>
            <option value="">Selecione…</option>
            {MOTIVOS_RECUSA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo={motivo === 'Outro' ? 'Descreva o motivo' : 'Detalhe (opcional)'} obrigatorio={motivo === 'Outro'} htmlFor="rec_texto">
          <AreaTexto id="rec_texto" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="perigo" disabled={justificativa.length < 3} onClick={() => aoConfirmar(justificativa)}>
            Confirmar recusa
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function ConcluirModal({ c, sla, agora, aoFechar, aoConfirmar }: { c: ChamadoApp; sla: number; agora: Date; aoFechar: () => void; aoConfirmar: (motivo: string, texto: string) => void }) {
  const atrasado = (minutosEntre(c.aberto_em, agora) ?? 0) > sla;
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const valido = !atrasado || (motivo && (motivo !== 'Outro' || texto.trim()));
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Concluir ${c.numero}`}>
      <div className="space-y-3">
        <p className="text-sm">
          Paciente entregue em <strong>{c.setor_destino ?? 'alta'}</strong>
          {c.leito_destino && ` · leito ${c.leito_destino}`}?
        </p>
        {atrasado && (
          <>
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              🔴 Passou do prazo de {sla} min ({fmtDuracao(minutosEntre(c.aberto_em, agora))}). Informe o motivo do atraso.
            </p>
            <Campo rotulo="Motivo do atraso" obrigatorio htmlFor="conc_motivo">
              <Selecao id="conc_motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                <option value="">Selecione…</option>
                {MOTIVOS_ATRASO.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Selecao>
            </Campo>
            {motivo === 'Outro' && (
              <Campo rotulo="Descreva o motivo" obrigatorio htmlFor="conc_texto">
                <Entrada id="conc_texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
              </Campo>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="sucesso" disabled={!valido} onClick={() => aoConfirmar(motivo, texto)}>
            Concluir
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
