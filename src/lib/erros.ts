// Mensagens de erro amigáveis a partir dos erros do Supabase/PostgREST.
export function mensagemErro(e: unknown): string {
  if (!e) return 'Erro desconhecido';
  const err = e as { message?: string; code?: string; hint?: string };
  const msg = err.message ?? String(e);
  if (err.code === '42501' || /permission denied|Sem permissão/i.test(msg)) return 'Sem permissão para esta operação.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (/Invalid login credentials/i.test(msg)) return 'Usuário ou senha incorretos.';
  if (/JWT expired/i.test(msg)) return 'Sessão expirada. Entre novamente.';
  return msg;
}

export const exigeMotivoAtrasoErro = (e: unknown) => (e as { hint?: string })?.hint === 'MOTIVO_ATRASO_OBRIGATORIO';
