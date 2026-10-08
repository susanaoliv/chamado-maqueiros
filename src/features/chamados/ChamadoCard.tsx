import { useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AreaTexto, Botao, Campo, Entrada, Modal, Selecao, Selo } from '@/components/ui';
import { MOTIVOS_ATRASO, STATUS_INFO, STATUS_INTERMEDIARIOS, type StatusChamado } from '@/lib/constantes';
import { estaAberto, estaAtrasado, exigeMotivoAtraso } from '@/lib/regras';
import { fmtDuracao, fmtHora, minutosEntre } from '@/lib/tempo';
import { exigeMotivoAtrasoErro, mensagemErro } from '@/lib/erros';
import type { ChamadoMetrica, PainelMaqueiro } from '@/types/database';
import { useAcionarMaqueiro, useCancelarChamado, useEncerrarChamado, useMudarStatus } from './api';

export function StatusSelo({ status, atrasado }: { status: string; atrasado?: boolean }) {
  const info = STATUS_INFO[status as StatusChamado] ?? STATUS_INFO.aguardando_maqueiro;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Selo className={info.classe}>
        {info.icone} {info.rotulo}
      </Selo>
      {atrasado && (
        <Selo className={STATUS_INFO.atrasado.classe}>
          {STATUS_INFO.atrasado.icone} {STATUS_INFO.atrasado.rotulo}
        </Selo>
      )}
    </span>
  );
}

const CLASSE_PRIORIDADE: Record<string, string> = {
  Urgente: 'bg-red-600 text-white',
  Prioritário: 'bg-orange-500 text-white',
  Rotina: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export function Trajeto({ c }: { c: ChamadoMetrica }) {
  return (
    <div className="text-base font-semibold">
      {c.setor_origem_nome}
      {c.leito_origem && <span className="font-normal text-slate-500"> · leito {c.leito_origem}</span>}
      {c.setor_destino_nome ? (
        <>
          <span className="mx-1.5 text-slate-400">→</span>
          {c.setor_destino_nome}
          {c.leito_destino && <span className="font-normal text-slate-500"> · leito {c.leito_destino}</span>}
        </>
      ) : (
        <span className="ml-1.5 text-sm font-normal text-slate-500">(sem destino · alta)</span>
      )}
    </div>
  );
}

type Props = {
  c: ChamadoMetrica;
  sla: number;
  agora: Date;
  modo: 'central' | 'setor';
  maqueiros?: PainelMaqueiro[];
};

export function ChamadoCard({ c, sla, agora, modo, maqueiros = [] }: Props) {
  const aberto = estaAberto(c.status);
  const atrasado = aberto && estaAtrasado(c, sla, agora);
  const decorrido = minutosEntre(c.aberto_em, aberto ? agora : (c.encerrado_em ?? c.cancelado_em));
  const [maqueiroSel, setMaqueiroSel] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const acionar = useAcionarMaqueiro();
  const mudar = useMudarStatus();
  const encerrar = useEncerrarChamado();

  const disponiveis = maqueiros.filter((m) => m.disponivel_para_acionar);

  const tentarEncerrar = async () => {
    if (exigeMotivoAtraso(c.aberto_em, sla, agora)) {
      setEncerrando(true);
      return;
    }
    try {
      const r = await encerrar.mutateAsync({ p_chamado_id: c.id });
      toast.success(`${r.numero} encerrado às ${fmtHora(r.encerrado_em)} · ${fmtDuracao(minutosEntre(r.aberto_em, r.encerrado_em))}`);
    } catch (e) {
      if (exigeMotivoAtrasoErro(e)) setEncerrando(true);
      else toast.error(mensagemErro(e));
    }
  };

  return (
    <article
      data-testid="chamado-card"
      className={clsx(
        'rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900',
        atrasado ? 'border-red-400 ring-1 ring-red-300 dark:border-red-700' : 'border-slate-200 dark:border-slate-800',
        !aberto && 'opacity-80',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{c.numero}</span>
        <Selo className={CLASSE_PRIORIDADE[c.prioridade]}>{c.prioridade}</Selo>
        <StatusSelo status={c.status} atrasado={atrasado} />
        <span className={clsx('ml-auto text-sm tabular-nums', atrasado ? 'font-bold text-red-600' : 'text-slate-500')}>
          {fmtHora(c.aberto_em)} · {fmtDuracao(decorrido)}
        </span>
      </header>

      <div className="mt-2">
        <Trajeto c={c} />
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
        <span>
          <strong>{c.tipo}</strong> · {c.recurso}
        </span>
        {c.paciente && <span>Paciente: {c.paciente}</span>}
        {c.solicitante && <span>Solicitante: {c.solicitante}</span>}
        {modo === 'central' && <span className="text-slate-500">{c.origem_chamado}</span>}
      </div>

      {(c.precisa_isolamento || c.precisa_oxigenio) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.precisa_isolamento && <Selo className="bg-orange-500 text-white">⚠ ISOLAMENTO</Selo>}
          {c.precisa_oxigenio && <Selo className="bg-sky-600 text-white">⚠ OXIGÊNIO</Selo>}
        </div>
      )}
      {c.observacao && <p className="mt-2 rounded bg-yellow-50 px-2 py-1 text-sm dark:bg-yellow-900/30">Obs.: {c.observacao}</p>}

      {/* Linha do tempo resumida */}
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {c.status === 'aguardando_maqueiro' && modo === 'setor' && 'Aguardando a Central acionar o maqueiro.'}
        {c.maqueiro_nome && (
          <>
            Maqueiro <strong>{c.maqueiro_nome}</strong> acionado às {fmtHora(c.maqueiro_informado_em)}
            {c.min_acionamento !== null && <span className="text-slate-500"> ({fmtDuracao(Number(c.min_acionamento))} após abertura)</span>}
            {c.inicio_atendimento_em && <> · atendimento às {fmtHora(c.inicio_atendimento_em)}</>}
          </>
        )}
        {c.status === 'concluido' && (
          <span className="block">
            Concluído às {fmtHora(c.encerrado_em)} · {fmtDuracao(Number(c.min_total))}
            {c.motivo_atraso && (
              <span className="text-red-600">
                {' '}
                · atraso: {c.motivo_atraso}
                {c.motivo_atraso_texto ? ` (${c.motivo_atraso_texto})` : ''}
              </span>
            )}
          </span>
        )}
        {c.status === 'cancelado' && (
          <span className="block">
            Cancelado às {fmtHora(c.cancelado_em)} por {c.cancelado_por}: <em>{c.cancelado_motivo}</em>
          </span>
        )}
      </p>

      {/* Ações */}
      {aberto && modo === 'central' && (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <Selecao
              aria-label={`Maqueiro para ${c.numero}`}
              className="min-w-0 flex-1 basis-56"
              value={maqueiroSel}
              onChange={(e) => setMaqueiroSel(e.target.value)}
            >
              <option value="">{c.maqueiro_id ? 'Trocar maqueiro…' : 'Escolher maqueiro…'}</option>
              {disponiveis.map((m) => (
                <option key={m.maqueiro_id} value={m.maqueiro_id}>
                  {m.nome}
                  {m.chamados_ativos > 0 ? ` (ocupado: ${m.chamado_atual_numero})` : ' · livre'}
                  {m.setor_atuacao !== 'Hospital' ? ` · ${m.setor_atuacao}` : ''}
                </option>
              ))}
            </Selecao>
            <Botao
              variante="primario"
              disabled={!maqueiroSel}
              carregando={acionar.isPending}
              onClick={() => acionar.mutate({ p_chamado_id: c.id, p_maqueiro_id: maqueiroSel }, { onSuccess: () => setMaqueiroSel('') })}
            >
              Informar maqueiro
            </Botao>
          </div>
          {disponiveis.length === 0 && (
            <p role="alert" className="text-sm font-medium text-orange-700 dark:text-orange-300">
              Nenhum maqueiro disponível agora. Use a aba Maqueiros para habilitar alguém (troca, cobertura ou hora extra).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Selecao
              aria-label={`Status de ${c.numero}`}
              className="min-w-0 flex-1 basis-48"
              value={c.status}
              disabled={mudar.isPending}
              onChange={(e) => mudar.mutate({ p_chamado_id: c.id, p_status: e.target.value })}
            >
              <option value="aguardando_maqueiro" disabled={!!c.maqueiro_id}>
                {STATUS_INFO.aguardando_maqueiro.icone} {STATUS_INFO.aguardando_maqueiro.rotulo}
              </option>
              {STATUS_INTERMEDIARIOS.map((s) => (
                <option key={s} value={s} disabled={!c.maqueiro_id && (s === 'maqueiro_acionado' || s === 'em_atendimento')}>
                  {STATUS_INFO[s].icone} {STATUS_INFO[s].rotulo}
                </option>
              ))}
            </Selecao>
            <Botao variante="sucesso" tamanho="lg" disabled={!c.maqueiro_id} carregando={encerrar.isPending} onClick={tentarEncerrar}
              title={!c.maqueiro_id ? 'Informe o maqueiro antes de encerrar' : undefined}>
              ENCERRAR
            </Botao>
            <Botao variante="secundario" onClick={() => setCancelando(true)}>
              Cancelar chamado
            </Botao>
          </div>
        </div>
      )}
      {aberto && modo === 'setor' && (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <Botao variante="secundario" onClick={() => setCancelando(true)}>
            Cancelar chamado
          </Botao>
        </div>
      )}

      <EncerrarModal aberto={encerrando} aoFechar={() => setEncerrando(false)} chamado={c} sla={sla} agora={agora} />
      <CancelarModal aberto={cancelando} aoFechar={() => setCancelando(false)} chamado={c} />
    </article>
  );
}

export function EncerrarModal({ aberto, aoFechar, chamado, sla, agora }: { aberto: boolean; aoFechar: () => void; chamado: ChamadoMetrica; sla: number; agora: Date }) {
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const encerrar = useEncerrarChamado();
  const decorrido = minutosEntre(chamado.aberto_em, agora);

  const confirmar = async () => {
    if (!motivo) return setErro('Informe o motivo do atraso.');
    if (motivo === 'Outro' && !texto.trim()) return setErro('Descreva o motivo.');
    try {
      const r = await encerrar.mutateAsync({ p_chamado_id: chamado.id, p_motivo_atraso: motivo, p_motivo_atraso_texto: texto.trim() || null });
      toast.success(`${r.numero} encerrado às ${fmtHora(r.encerrado_em)} · ${fmtDuracao(minutosEntre(r.aberto_em, r.encerrado_em))}`);
      aoFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={`Encerrar ${chamado.numero}`}>
      <div className="space-y-4">
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          🔴 Este chamado está com {fmtDuracao(decorrido)}, acima do prazo de {sla} min.
        </p>
        <Campo rotulo="Qual foi o motivo do atraso?" obrigatorio htmlFor="motivo_atraso">
          <Selecao id="motivo_atraso" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus>
            <option value="">Selecione…</option>
            {MOTIVOS_ATRASO.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Selecao>
        </Campo>
        {motivo === 'Outro' && (
          <Campo rotulo="Descreva o motivo" obrigatorio htmlFor="motivo_texto">
            <Entrada id="motivo_texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
        )}
        {erro && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao variante="sucesso" carregando={encerrar.isPending} onClick={confirmar}>
            ENCERRAR CHAMADO
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

export function CancelarModal({ aberto, aoFechar, chamado }: { aberto: boolean; aoFechar: () => void; chamado: ChamadoMetrica }) {
  const [just, setJust] = useState('');
  const cancelar = useCancelarChamado();
  const valido = just.trim().length >= 3;
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={`Cancelar ${chamado.numero}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          O chamado não será excluído: fica registrado como cancelado, com a justificativa, e entra nos indicadores de ineficiência.
        </p>
        <Campo rotulo="Justificativa do cancelamento" obrigatorio htmlFor="just_cancel">
          <AreaTexto
            id="just_cancel"
            rows={3}
            autoFocus
            value={just}
            onChange={(e) => setJust(e.target.value)}
            placeholder="ex.: paciente não estava pronto · enfermagem demorou · setor desistiu do transporte"
          />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao
            variante="perigo"
            disabled={!valido}
            carregando={cancelar.isPending}
            onClick={() => cancelar.mutate({ p_chamado_id: chamado.id, p_justificativa: just.trim() }, { onSuccess: aoFechar })}
          >
            Confirmar cancelamento
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

export function ordenarFila(a: ChamadoMetrica, b: ChamadoMetrica) {
  const ordem: Record<string, number> = { Urgente: 0, Prioritário: 1, Rotina: 2 };
  return (ordem[a.prioridade] ?? 9) - (ordem[b.prioridade] ?? 9) || a.aberto_em.localeCompare(b.aberto_em);
}
