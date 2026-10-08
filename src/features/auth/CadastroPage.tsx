import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Botao, Campo, Entrada, Selecao } from '@/components/ui';
import { normalizar } from '@/lib/regras';
import { mensagemErro } from '@/lib/erros';
import { enviarCadastro, listarSetoresPublico, schemaCadastro, type CadastroEntrada, type CadastroSaida } from './cadastro';

export function CadastroPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ usuario: string; aprovado: boolean } | null>(null);
  const setores = useQuery({ queryKey: ['setores-publico'], queryFn: listarSetoresPublico, staleTime: 10 * 60 * 1000 });
  const { register, handleSubmit, watch, setValue, getValues, formState } = useForm<CadastroEntrada, unknown, CadastroSaida>({
    resolver: zodResolver(schemaCadastro),
    defaultValues: { nome: '', usuario: '', papel: 'setor', setor_id: '', senha: '', confirmacao: '' },
  });
  const erros = formState.errors;
  const papel = watch('papel');
  const usuario = watch('usuario');

  const onSubmit = async (v: CadastroSaida) => {
    setErro(null);
    try {
      const r = await enviarCadastro(v);
      setResultado({ usuario: r.usuario, aprovado: r.aprovado });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  if (resultado) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-4xl">{resultado.aprovado ? '✅' : '⏳'}</div>
          <h1 className="text-xl font-bold">{resultado.aprovado ? 'Acesso de gestão criado' : 'Cadastro enviado'}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Seu usuário é <strong className="font-mono">{resultado.usuario}</strong>.{' '}
            {resultado.aprovado
              ? 'Por ser o primeiro cadastro do sistema, ele já tem perfil de gestão. Entre agora e aprove os próximos cadastros em Configurações → Acessos.'
              : 'Ele fica aguardando a aprovação da gestão. Assim que for aprovado, você já consegue entrar.'}
          </p>
          <Link to="/login" className="inline-block rounded-lg bg-marca-600 px-5 py-3 font-semibold text-white hover:bg-marca-700">
            Ir para o login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold">Criar acesso</h1>
          <p className="text-sm text-slate-500">Chamados de Maqueiros · Casa de Saúde São Lucas</p>
        </div>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <Campo rotulo="Seu nome" erro={erros.nome?.message} htmlFor="cad_nome">
            <Entrada
              id="cad_nome"
              autoComplete="name"
              autoFocus
              {...register('nome', {
                onBlur: () => {
                  // sugere o usuário a partir do primeiro nome, se ainda estiver vazio
                  if (!getValues('usuario')) setValue('usuario', normalizar(getValues('nome').split(' ')[0] ?? ''));
                },
              })}
            />
          </Campo>

          <Campo rotulo="Perfil" erro={erros.papel?.message} htmlFor="cad_papel">
            <Selecao id="cad_papel" {...register('papel')}>
              <option value="setor">Setor de enfermagem</option>
              <option value="telefonista">Central de Telefonistas</option>
              <option value="gestao">Gestão</option>
            </Selecao>
          </Campo>

          {papel === 'setor' && (
            <Campo rotulo="Setor" erro={erros.setor_id?.message} htmlFor="cad_setor">
              <Selecao id="cad_setor" invalido={!!erros.setor_id} {...register('setor_id')} disabled={setores.isLoading}>
                <option value="">{setores.isLoading ? 'Carregando…' : 'Selecione…'}</option>
                {(setores.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </Selecao>
              {setores.error && <span className="text-sm text-red-600">{mensagemErro(setores.error)}</span>}
            </Campo>
          )}

          <Campo
            rotulo="Usuário para entrar"
            erro={erros.usuario?.message}
            htmlFor="cad_usuario"
            dica={usuario ? `Você vai entrar como: ${normalizar(usuario) || '…'}` : 'Sem acento e sem espaço.'}
          >
            <Entrada id="cad_usuario" autoComplete="username" autoCapitalize="none" invalido={!!erros.usuario} {...register('usuario')} />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Senha" erro={erros.senha?.message} htmlFor="cad_senha" dica="Mínimo de 8 caracteres.">
              <Entrada id="cad_senha" type="password" autoComplete="new-password" invalido={!!erros.senha} {...register('senha')} />
            </Campo>
            <Campo rotulo="Repita a senha" erro={erros.confirmacao?.message} htmlFor="cad_conf">
              <Entrada id="cad_conf" type="password" autoComplete="new-password" invalido={!!erros.confirmacao} {...register('confirmacao')} />
            </Campo>
          </div>

          <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            O acesso só é liberado depois da aprovação da gestão, que pode ajustar o perfil e o setor.
          </p>

          {erro && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {erro}
            </p>
          )}
          <Botao type="submit" tamanho="lg" className="w-full" carregando={formState.isSubmitting}>
            Enviar cadastro
          </Botao>
          <p className="text-center text-sm">
            <Link to="/login" className="text-marca-600 underline">
              Já tenho acesso
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
