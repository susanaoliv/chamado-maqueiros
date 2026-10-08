import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AreaTexto, Botao, Campo, Entrada, Selecao, SimNao } from '@/components/ui';
import { ORIGENS_CHAMADO, PRIORIDADES, RECURSOS, TIPOS_CHAMADO } from '@/lib/constantes';
import {
  DESTINO_OUTRO,
  destinoTravadoNecroterio,
  destinoVisivel,
  leitoDestinoObrigatorio,
  leitoOrigemObrigatorio,
  normalizar,
  paraArgsRpc,
  schemaNovoChamado,
  valoresPadrao,
  type NovoChamadoForm as FormValores,
} from '@/lib/regras';
import { fmtDataHora, fmtHora, inputLocalParaIso, agora } from '@/lib/tempo';
import { useConfig, useSetores } from '@/hooks/dados';
import { usePerfil } from '@/features/auth/AuthProvider';
import { useAbrirChamado } from './api';
import { mensagemErro } from '@/lib/erros';

export function NovoChamadoForm({ aoConcluir }: { aoConcluir: () => void }) {
  const perfil = usePerfil();
  const { data: setores = [] } = useSetores();
  const { data: config } = useConfig();
  const abrir = useAbrirChamado();
  const ehSetor = perfil.papel === 'setor';
  const ehGestao = perfil.papel === 'gestao';
  const ativos = useMemo(() => setores.filter((s) => s.ativo), [setores]);
  const necroterio = ativos.find((s) => normalizar(s.nome) === 'necroterio');

  const resolver = useMemo(
    () =>
      zodResolver(
        schemaNovoChamado({
          setores: ativos,
          papel: perfil.papel,
          somenteNumeroAtendimento: config?.somenteNumeroAtendimento ?? false,
        }),
      ),
    [ativos, perfil.papel, config?.somenteNumeroAtendimento],
  );

  const { register, handleSubmit, watch, control, setValue, formState, setFocus } = useForm<FormValores>({
    resolver,
    defaultValues: valoresPadrao(ehSetor ? (perfil.setor_id ?? undefined) : undefined),
  });
  const erros = formState.errors;
  const tipo = watch('tipo');
  const origemId = watch('setor_origem_id');
  const destinoId = watch('setor_destino_id');
  const origem = ativos.find((s) => s.id === origemId);
  const leitoOrigemObrig = leitoOrigemObrigatorio(tipo, origem);
  const mostrarDestino = destinoVisivel(tipo);
  const travadoNecroterio = destinoTravadoNecroterio(tipo);
  const leitoDestinoObrig = leitoDestinoObrigatorio(tipo);
  const somenteNumero = config?.somenteNumeroAtendimento ?? false;

  // Óbito → destino Necrotério travado; Alta → sem destino
  const tipoAnterior = useRef(tipo);
  useEffect(() => {
    if (travadoNecroterio && necroterio) setValue('setor_destino_id', necroterio.id);
    else if (tipoAnterior.current === 'Óbito') setValue('setor_destino_id', '');
    if (!mostrarDestino) {
      setValue('setor_destino_id', '');
      setValue('leito_destino', '');
      setValue('destino_outro', '');
    }
    tipoAnterior.current = tipo;
  }, [tipo, travadoNecroterio, mostrarDestino, necroterio, setValue]);

  useEffect(() => {
    setFocus(ehSetor ? 'tipo' : 'setor_origem_id');
  }, [setFocus, ehSetor]);

  const onSubmit = async (v: FormValores) => {
    const abertoIso = ehGestao && v.aberto_em ? inputLocalParaIso(v.aberto_em) : null;
    try {
      const c = await abrir.mutateAsync(paraArgsRpc(v, ativos, abertoIso));
      toast.success(`Chamado ${c.numero} registrado às ${fmtHora(c.aberto_em)}`, { duration: 6000 });
      aoConcluir();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* 1. Data/hora */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
        <span>
          <strong>Abertura:</strong> {fmtDataHora(agora())} <span className="text-slate-500">(hora do servidor)</span>
        </span>
        {ehGestao && (
          <details className="w-full">
            <summary className="cursor-pointer text-marca-600">Informar outra hora (gestão)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data/hora de abertura" htmlFor="aberto_em">
                <Entrada id="aberto_em" type="datetime-local" {...register('aberto_em')} />
              </Campo>
              <Campo rotulo="Justificativa" erro={erros.justificativa_hora?.message} htmlFor="justificativa_hora">
                <Entrada id="justificativa_hora" placeholder="ex.: registro feito no livro" {...register('justificativa_hora')} />
              </Campo>
            </div>
          </details>
        )}
      </div>

      {/* 2. Tipo */}
      <Campo rotulo="Tipo de chamado" erro={erros.tipo?.message} htmlFor="tipo">
        <Selecao id="tipo" {...register('tipo')}>
          {TIPOS_CHAMADO.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Selecao>
      </Campo>

      {/* 3. Origem + leito */}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Campo rotulo="Setor de origem (solicitante)" erro={erros.setor_origem_id?.message} htmlFor="setor_origem_id">
          {ehSetor ? (
            <div id="setor_origem_id" className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold dark:border-slate-600 dark:bg-slate-800">
              {perfil.setorNome ?? origem?.nome}
            </div>
          ) : (
            <Selecao id="setor_origem_id" invalido={!!erros.setor_origem_id} {...register('setor_origem_id')}>
              <option value="">Selecione…</option>
              {ativos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Nº do leito de origem" obrigatorio={leitoOrigemObrig} erro={erros.leito_origem?.message} htmlFor="leito_origem">
          <Entrada id="leito_origem" inputMode="text" invalido={!!erros.leito_origem} {...register('leito_origem')} />
        </Campo>
      </div>

      {/* 4. Destino + leito */}
      {mostrarDestino ? (
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Campo rotulo="Setor de destino" erro={erros.setor_destino_id?.message} htmlFor="setor_destino_id">
            {travadoNecroterio ? (
              <div id="setor_destino_id" className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold dark:border-slate-600 dark:bg-slate-800">
                Necrotério <span className="text-xs font-normal text-slate-500">(automático para óbito)</span>
              </div>
            ) : (
              <Selecao id="setor_destino_id" invalido={!!erros.setor_destino_id} {...register('setor_destino_id')}>
                <option value="">Selecione…</option>
                {ativos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
                <option value={DESTINO_OUTRO}>Outro (digitar)</option>
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Nº do leito de destino" obrigatorio={leitoDestinoObrig} erro={erros.leito_destino?.message} htmlFor="leito_destino">
            <Entrada id="leito_destino" invalido={!!erros.leito_destino} {...register('leito_destino')} />
          </Campo>
          {destinoId === DESTINO_OUTRO && (
            <Campo rotulo="Descreva o destino" erro={erros.destino_outro?.message} className="sm:col-span-2" htmlFor="destino_outro">
              <Entrada id="destino_outro" {...register('destino_outro')} />
            </Campo>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Alta: o setor de destino não é exigido.
        </p>
      )}

      {/* 5. Paciente */}
      <Campo
        rotulo={somenteNumero ? 'Nº do atendimento' : 'Nome do paciente / nº do atendimento'}
        erro={erros.paciente?.message}
        htmlFor="paciente"
        dica={somenteNumero ? 'Por proteção de dados, informe apenas o número do atendimento.' : undefined}
      >
        <Entrada id="paciente" inputMode={somenteNumero ? 'numeric' : 'text'} invalido={!!erros.paciente} {...register('paciente')} />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* 6. Origem do chamado */}
        {!ehSetor && (
          <Campo rotulo="Origem do chamado" htmlFor="origem_chamado">
            <Selecao id="origem_chamado" {...register('origem_chamado')}>
              {ORIGENS_CHAMADO.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Selecao>
          </Campo>
        )}
        {/* 7. Solicitante */}
        <Campo rotulo="Nome de quem está solicitando" obrigatorio={ehSetor} erro={erros.solicitante?.message} htmlFor="solicitante">
          <Entrada id="solicitante" invalido={!!erros.solicitante} {...register('solicitante')} />
        </Campo>
        {/* 8. Recurso */}
        <Campo rotulo="Recurso necessário" htmlFor="recurso">
          <Selecao id="recurso" {...register('recurso')}>
            {RECURSOS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Selecao>
        </Campo>
        {/* 10. Prioridade */}
        <Campo rotulo="Prioridade" htmlFor="prioridade">
          <Selecao id="prioridade" {...register('prioridade')}>
            {PRIORIDADES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Selecao>
        </Campo>
      </div>

      {/* 9. Isolamento / oxigênio */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="precisa_isolamento"
          render={({ field }) => <SimNao rotulo="⚠ Necessita de isolamento?" valor={field.value} onChange={field.onChange} />}
        />
        <Controller
          control={control}
          name="precisa_oxigenio"
          render={({ field }) => <SimNao rotulo="⚠ Necessita de oxigênio?" valor={field.value} onChange={field.onChange} />}
        />
      </div>

      {/* 11. Observação */}
      <Campo rotulo="Observação" htmlFor="observacao">
        <AreaTexto id="observacao" rows={2} {...register('observacao')} />
      </Campo>

      {/* 12. Registrar */}
      <Botao type="submit" tamanho="xl" className="w-full" carregando={formState.isSubmitting}>
        REGISTRAR CHAMADO
      </Botao>
    </form>
  );
}
