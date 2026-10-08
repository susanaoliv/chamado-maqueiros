import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, definirAtorNome, obterAtorNome } from '@/lib/supabase';
import { definirOffsetServidor } from '@/lib/tempo';
import { DOMINIO_LOGIN } from '@/lib/constantes';
import { normalizar } from '@/lib/regras';
import type { Perfil } from '@/types/database';

export type Papel = 'gestao' | 'telefonista' | 'setor';

type Ctx = {
  carregando: boolean;
  sessao: Session | null;
  perfil: (Perfil & { papel: Papel }) | null;
  setorNome: string | null;
  atorNome: string;
  semPerfil: boolean;
  entrar: (usuario: string, senha: string, nome: string) => Promise<void>;
  sair: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export async function sincronizarRelogio() {
  const enviado = Date.now();
  const { data } = await supabase.rpc('agora_servidor');
  if (data) definirOffsetServidor(data as string, enviado, Date.now());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Ctx['perfil']>(null);
  const [setorNome, setSetorNome] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semPerfil, setSemPerfil] = useState(false);
  const [atorNome, setAtorNome] = useState(obterAtorNome());

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null);
      setSetorNome(null);
      setSemPerfil(false);
      return;
    }
    const { data } = await supabase.from('perfis').select('*').eq('id', s.user.id).maybeSingle();
    if (!data || !data.ativo) {
      setPerfil(null);
      setSemPerfil(true);
      return;
    }
    setSemPerfil(false);
    setPerfil(data as Ctx['perfil']);
    if (data.setor_id) {
      const { data: st } = await supabase.from('setores').select('nome').eq('id', data.setor_id).maybeSingle();
      setSetorNome(st?.nome ?? null);
    } else setSetorNome(null);
    sincronizarRelogio().catch(() => undefined);
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      await carregarPerfil(data.session);
      if (ativo) setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'SIGNED_OUT') {
        setPerfil(null);
        qc.clear();
      }
      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
        // fora do callback para não travar o cliente de auth
        setTimeout(() => carregarPerfil(s), 0);
      }
    });
    const t = setInterval(() => sincronizarRelogio().catch(() => undefined), 10 * 60 * 1000);
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
      clearInterval(t);
    };
  }, [carregarPerfil, qc]);

  const entrar = useCallback(
    async (usuario: string, senha: string, nome: string) => {
      definirAtorNome(nome);
      setAtorNome(nome.trim());
      const email = `${normalizar(usuario)}@${DOMINIO_LOGIN}`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      setSessao(data.session);
      await carregarPerfil(data.session);
    },
    [carregarPerfil],
  );

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
    definirAtorNome('');
    setAtorNome('');
    setPerfil(null);
    qc.clear();
  }, [qc]);

  const valor = useMemo<Ctx>(
    () => ({ carregando, sessao, perfil, setorNome, atorNome, semPerfil, entrar, sair }),
    [carregando, sessao, perfil, setorNome, atorNome, semPerfil, entrar, sair],
  );
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}

/** Perfil garantido (usar apenas dentro de rotas protegidas). */
export function usePerfil() {
  const { perfil, atorNome, setorNome } = useAuth();
  if (!perfil) throw new Error('Sem perfil');
  return { ...perfil, atorNome: atorNome || perfil.nome, setorNome: setorNome ?? (perfil.papel === 'setor' ? perfil.nome : null) };
}
