import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate } from 'react-router-dom';
import { Botao, Campo, Entrada } from '@/components/ui';
import { useAuth } from './AuthProvider';
import { mensagemErro } from '@/lib/erros';
import { supabaseConfigurado } from '@/lib/supabase';

const schema = z.object({
  usuario: z.string().trim().min(2, 'Informe o usuário'),
  senha: z.string().min(1, 'Informe a senha'),
  nome: z.string().max(60),
});
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const { entrar, perfil, semPerfil, sair } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { usuario: '', senha: '', nome: '' },
  });

  if (perfil) return <Navigate to="/" replace />;

  const onSubmit = async (v: Form) => {
    setErro(null);
    try {
      await entrar(v.usuario, v.senha, v.nome);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold">Chamados de Maqueiros</h1>
          <p className="text-sm text-slate-500">Casa de Saúde São Lucas</p>
        </div>
        {!supabaseConfigurado && (
          <p role="alert" className="mb-4 rounded-lg bg-orange-100 p-3 text-sm text-orange-900">
            Sistema sem configuração do servidor. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Campo rotulo="Usuário" erro={formState.errors.usuario?.message} htmlFor="usuario">
            <Entrada id="usuario" autoComplete="username" autoCapitalize="none" autoFocus placeholder="ex.: telefonista, uti1, saojose" {...register('usuario')} />
          </Campo>
          <Campo rotulo="Senha" erro={formState.errors.senha?.message} htmlFor="senha">
            <Entrada id="senha" type="password" autoComplete="current-password" {...register('senha')} />
          </Campo>
          <Campo rotulo="Seu nome (opcional)" htmlFor="nome" dica="Fica registrado em quem abriu ou encerrou os chamados.">
            <Entrada id="nome" autoComplete="name" placeholder="ex.: Maria" {...register('nome')} />
          </Campo>
          {erro && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {erro}
            </p>
          )}
          {semPerfil && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              Este usuário não tem acesso liberado ao sistema. Procure a gestão.{' '}
              <button type="button" className="underline" onClick={() => sair()}>
                Sair
              </button>
            </div>
          )}
          <Botao type="submit" tamanho="lg" className="w-full" carregando={formState.isSubmitting}>
            Entrar
          </Botao>
        </form>
      </div>
    </main>
  );
}
