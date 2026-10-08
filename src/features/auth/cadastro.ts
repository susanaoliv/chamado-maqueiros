import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { normalizar } from '@/lib/regras';

export const schemaCadastro = z
  .object({
    nome: z.string().trim().min(3, 'Informe seu nome').max(60, 'Máximo de 60 caracteres'),
    usuario: z
      .string()
      .transform((v) => normalizar(v))
      .pipe(z.string().min(3, 'Use de 3 a 40 letras ou números').max(40, 'Use de 3 a 40 letras ou números')),
    papel: z.enum(['telefonista', 'setor', 'gestao', 'maqueiro'], { message: 'Escolha o perfil' }),
    setor_id: z.string(),
    maqueiro_id: z.string(),
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
    confirmacao: z.string(),
  })
  .superRefine((v, c) => {
    if (v.papel === 'setor' && !v.setor_id) c.addIssue({ code: 'custom', path: ['setor_id'], message: 'Escolha o setor' });
    if (v.papel === 'maqueiro' && !v.maqueiro_id) c.addIssue({ code: 'custom', path: ['maqueiro_id'], message: 'Escolha seu nome na lista' });
    if (v.senha !== v.confirmacao) c.addIssue({ code: 'custom', path: ['confirmacao'], message: 'As senhas não conferem' });
  });

export type CadastroEntrada = z.input<typeof schemaCadastro>;
export type CadastroSaida = z.output<typeof schemaCadastro>;

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cadastro', { body });
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

export const listarSetoresPublico = () => chamar<{ setores: { id: string; nome: string }[] }>({ acao: 'setores' }).then((r) => r.setores);

export const listarMaqueirosPublico = () =>
  chamar<{ maqueiros: { id: string; nome: string }[] }>({ acao: 'maqueiros' }).then((r) => r.maqueiros);

export const enviarCadastro = (v: CadastroSaida) =>
  chamar<{ usuario: string; papel: string; aprovado: boolean }>({
    acao: 'cadastrar',
    nome: v.nome,
    usuario: v.usuario,
    senha: v.senha,
    papel: v.papel,
    setor_id: v.papel === 'setor' ? v.setor_id : null,
    maqueiro_id: v.papel === 'maqueiro' ? v.maqueiro_id : null,
  });
