import { useState } from 'react';
import clsx from 'clsx';
import { AreaTexto, Botao, Campo, Carregando, Entrada, Erro, Modal, Selecao } from '@/components/ui';
import { usePainelMaqueiros } from '@/hooks/dados';
import { MOTIVOS_HABILITACAO, SITUACAO_MAQUEIRO, TIPOS_INDISPONIBILIDADE } from '@/lib/constantes';
import { fmtHora } from '@/lib/tempo';
import { useDesabilitar, useDisponibilizar, useHabilitar, useIndisponivel, useIntervalo } from '@/features/chamados/api';
import type { PainelMaqueiro } from '@/types/database';

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

export function MaqueirosPage() {
  const { data: painel, isLoading, error } = usePainelMaqueiros();
  const [habilitar, setHabilitar] = useState<PainelMaqueiro | null>(null);
  const [indisp, setIndisp] = useState<PainelMaqueiro | null>(null);
  const disponibilizar = useDisponibilizar();
  const desabilitar = useDesabilitar();
  const intervalo = useIntervalo();

  if (isLoading) return <Carregando />;
  if (error) return <Erro erro={error} />;
  const lista = painel ?? [];
  const plantao = lista.filter((m) => m.em_plantao);
  const fora = lista.filter((m) => !m.em_plantao);
  const semEscala = lista.length > 0 && !lista[0].escala_mes_cadastrada;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Maqueiros</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {plantao.filter((m) => m.disponivel_para_acionar).length} podem ser acionados ·{' '}
          {plantao.filter((m) => m.situacao === 'disponivel').length} livres agora
        </p>
      </div>
      {semEscala && (
        <p role="alert" className="rounded-lg bg-orange-100 p-3 text-sm text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
          ⚠ A escala deste mês ainda não foi cadastrada. O sistema está considerando o horário padrão de cada maqueiro, todos os dias.
          Peça à gestão para importar a escala.
        </p>
      )}
      {plantao.filter((m) => m.disponivel_para_acionar).length === 0 && (
        <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">
          Nenhum maqueiro pode ser acionado agora. Habilite alguém abaixo (troca de plantão, cobertura ou hora extra).
        </p>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {[...plantao, ...fora].map((m) => {
          const s = SITUACAO_MAQUEIRO[m.situacao] ?? SITUACAO_MAQUEIRO.fora_escala;
          return (
            <li key={m.maqueiro_id} className={clsx('flex flex-col gap-2 p-3 sm:flex-row sm:items-center', !m.em_plantao && 'opacity-60')} data-testid="maqueiro-linha">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {m.nome}
                  {m.setor_atuacao !== 'Hospital' && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs dark:bg-slate-700">{m.setor_atuacao}</span>}
                </div>
                <div className="text-sm text-slate-500">
                  Padrão {hhmm(m.horario_inicio)}–{hhmm(m.horario_fim)}
                  {m.em_plantao && m.turno_fim && (
                    <>
                      {' '}
                      · hoje até {fmtHora(m.turno_fim)}
                      {m.fonte === 'habilitacao' && ' (habilitado)'}
                      {m.fonte === 'padrao' && ' (sem escala)'}
                    </>
                  )}
                </div>
                {m.indisponibilidade_id && (
                  <div className="text-sm text-red-700 dark:text-red-300">
                    {m.indisponibilidade_tipo}: {m.indisponibilidade_justificativa}
                  </div>
                )}
              </div>
              <div className={clsx('w-48 text-sm font-semibold', s.classe)}>
                {s.icone} {s.rotulo}
                {m.chamado_atual_numero && <span className="block text-xs font-normal text-slate-500">{m.chamado_atual_numero}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {!m.em_plantao && (
                  <Botao tamanho="sm" onClick={() => setHabilitar(m)}>
                    Habilitar
                  </Botao>
                )}
                {m.em_plantao && m.fonte === 'habilitacao' && m.habilitacao_id && (
                  <Botao tamanho="sm" variante="secundario" carregando={desabilitar.isPending} onClick={() => desabilitar.mutate({ p_habilitacao_id: m.habilitacao_id! })}>
                    Desabilitar
                  </Botao>
                )}
                {m.em_plantao && !m.indisponibilidade_id && (
                  <>
                    <Botao tamanho="sm" variante="secundario" onClick={() => intervalo.mutate({ p_maqueiro_id: m.maqueiro_id, p_em_intervalo: !m.em_intervalo })}>
                      {m.em_intervalo ? 'Voltou do intervalo' : 'Intervalo'}
                    </Botao>
                    <Botao tamanho="sm" variante="aviso" onClick={() => setIndisp(m)}>
                      Indisponível
                    </Botao>
                  </>
                )}
                {m.indisponibilidade_id && (
                  <Botao tamanho="sm" variante="sucesso" carregando={disponibilizar.isPending} onClick={() => disponibilizar.mutate({ p_maqueiro_id: m.maqueiro_id })}>
                    Disponibilizar
                  </Botao>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {habilitar && <HabilitarModal m={habilitar} aoFechar={() => setHabilitar(null)} />}
      {indisp && <IndisponivelModal m={indisp} aoFechar={() => setIndisp(null)} />}
    </div>
  );
}

function HabilitarModal({ m, aoFechar }: { m: PainelMaqueiro; aoFechar: () => void }) {
  const [inicio, setInicio] = useState(hhmm(m.horario_inicio));
  const [fim, setFim] = useState(hhmm(m.horario_fim));
  const [motivo, setMotivo] = useState<string>(MOTIVOS_HABILITACAO[0]);
  const [obs, setObs] = useState('');
  const hab = useHabilitar();
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Habilitar ${m.nome}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Ele passa a constar como disponível hoje no horário abaixo e pode ser acionado.</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Início" htmlFor="hab_ini">
            <Entrada id="hab_ini" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo rotulo="Fim" htmlFor="hab_fim" dica="Se for menor que o início, termina no dia seguinte.">
            <Entrada id="hab_fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
          </Campo>
        </div>
        <Campo rotulo="Motivo" htmlFor="hab_motivo">
          <Selecao id="hab_motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS_HABILITACAO.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Observação" htmlFor="hab_obs">
          <Entrada id="hab_obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: substitui o colega X" />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao
            carregando={hab.isPending}
            disabled={!inicio || !fim}
            onClick={() =>
              hab.mutate(
                { p_maqueiro_id: m.maqueiro_id, p_hora_inicio: inicio, p_hora_fim: fim, p_motivo: motivo, p_observacao: obs || null },
                { onSuccess: aoFechar },
              )
            }
          >
            Habilitar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function IndisponivelModal({ m, aoFechar }: { m: PainelMaqueiro; aoFechar: () => void }) {
  const [tipo, setTipo] = useState<string>(TIPOS_INDISPONIBILIDADE[0]);
  const [just, setJust] = useState('');
  const ind = useIndisponivel();
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`${m.nome} indisponível`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Ele sai da lista de acionamento até ser disponibilizado novamente.</p>
        <Campo rotulo="Motivo" htmlFor="ind_tipo">
          <Selecao id="ind_tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_INDISPONIBILIDADE.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Justificativa" obrigatorio htmlFor="ind_just">
          <AreaTexto id="ind_just" rows={3} value={just} onChange={(e) => setJust(e.target.value)} autoFocus />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao
            variante="aviso"
            carregando={ind.isPending}
            disabled={just.trim().length < 3}
            onClick={() => ind.mutate({ p_maqueiro_id: m.maqueiro_id, p_tipo: tipo, p_justificativa: just.trim() }, { onSuccess: aoFechar })}
          >
            Marcar indisponível
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
