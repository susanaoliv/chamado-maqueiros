import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigurado = Boolean(url && anonKey);

// "Seu nome" informado no login. Vai em todas as requisições no cabeçalho x-ator-nome
// (codificado, pois cabeçalhos HTTP não aceitam acentos) e o banco grava em criado_por,
// encerrado_por e no histórico.
const CHAVE_NOME = 'maqueiros.ator_nome';
let atorNome = lerNomeSalvo();

function lerNomeSalvo() {
  try {
    return sessionStorage.getItem(CHAVE_NOME) ?? '';
  } catch {
    return '';
  }
}

export function definirAtorNome(nome: string) {
  atorNome = nome.trim().slice(0, 60);
  try {
    if (atorNome) sessionStorage.setItem(CHAVE_NOME, atorNome);
    else sessionStorage.removeItem(CHAVE_NOME);
  } catch {
    /* navegação privada */
  }
}

export function obterAtorNome() {
  return atorNome;
}

const fetchComAtor: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (atorNome) headers.set('x-ator-nome', encodeURIComponent(atorNome));
  return fetch(input, { ...init, headers });
};

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'chave-ausente', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'maqueiros.auth' },
  global: { fetch: fetchComAtor },
  realtime: { params: { eventsPerSecond: 10 } },
});

// Busca todas as linhas de uma consulta paginando (o PostgREST limita a 1000 por requisição).
export async function buscarTudo<R>(
  montar: (de: number, ate: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
  tamanho = 1000,
): Promise<R[]> {
  const todas: R[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < tamanho) break;
  }
  return todas;
}
