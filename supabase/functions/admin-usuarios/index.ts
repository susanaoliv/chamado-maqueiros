// Edge Function: gestão de acessos (somente perfil "gestao").
// Ações:
//   listar                                  → perfis cadastrados
//   criar     { usuario, papel, nome, setor_id? }  → cria login e devolve senha aleatória
//   redefinir { usuario }                   → nova senha aleatória
//   ativar    { usuario, ativo }            → bloqueia/desbloqueia o login (nunca exclui)
// A service_role só existe aqui (variável de ambiente do Supabase), nunca no front.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DOMINIO = 'maqueiros.cssl';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ator-nome',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Senha de 10 caracteres sem caracteres ambíguos (0/O, 1/l/I)
function senhaAleatoria(tamanho = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function normalizarUsuario(u: string) {
  return u
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Quem está chamando? Precisa ser gestão.
  const chamador = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await chamador.auth.getUser();
  if (userErr || !userData.user) return resposta({ erro: 'Não autenticado' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: perfilChamador } = await admin
    .from('perfis')
    .select('papel, ativo, usuario')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!perfilChamador || perfilChamador.papel !== 'gestao' || !perfilChamador.ativo) {
    return resposta({ erro: 'Somente a gestão pode gerenciar acessos' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return resposta({ erro: 'JSON inválido' }, 400);
  }
  const acao = String(body.acao ?? '');

  if (acao === 'listar') {
    const { data, error } = await admin
      .from('perfis')
      .select('id, usuario, papel, nome, setor_id, ativo, created_at')
      .order('papel')
      .order('usuario');
    if (error) return resposta({ erro: error.message }, 500);
    return resposta({ perfis: data });
  }

  if (acao === 'criar') {
    const usuario = normalizarUsuario(String(body.usuario ?? ''));
    const papel = String(body.papel ?? '');
    const nome = String(body.nome ?? '').trim() || usuario;
    const setorId = body.setor_id ? String(body.setor_id) : null;
    if (!usuario || usuario.length < 3) return resposta({ erro: 'Usuário inválido (mínimo 3 letras/números)' }, 400);
    if (!['gestao', 'telefonista', 'setor'].includes(papel)) return resposta({ erro: 'Papel inválido' }, 400);
    if (papel === 'setor' && !setorId) return resposta({ erro: 'Informe o setor' }, 400);

    const senha = senhaAleatoria();
    const { data: criado, error } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`,
      password: senha,
      email_confirm: true,
      user_metadata: { usuario, papel },
    });
    if (error || !criado.user) return resposta({ erro: error?.message ?? 'Falha ao criar usuário' }, 400);

    const { error: perfilErr } = await admin.from('perfis').insert({
      id: criado.user.id,
      usuario,
      papel,
      nome,
      setor_id: papel === 'setor' ? setorId : null,
    });
    if (perfilErr) {
      // desfaz o login sem perfil para não deixar conta órfã
      await admin.auth.admin.deleteUser(criado.user.id);
      return resposta({ erro: perfilErr.message }, 400);
    }
    return resposta({ usuario, senha });
  }

  if (acao === 'redefinir') {
    const usuario = normalizarUsuario(String(body.usuario ?? ''));
    const { data: perfil } = await admin.from('perfis').select('id').eq('usuario', usuario).maybeSingle();
    if (!perfil) return resposta({ erro: 'Usuário não encontrado' }, 404);
    const senha = senhaAleatoria();
    const { error } = await admin.auth.admin.updateUserById(perfil.id, { password: senha });
    if (error) return resposta({ erro: error.message }, 400);
    return resposta({ usuario, senha });
  }

  if (acao === 'ativar') {
    const usuario = normalizarUsuario(String(body.usuario ?? ''));
    const ativo = Boolean(body.ativo);
    if (usuario === perfilChamador.usuario && !ativo) {
      return resposta({ erro: 'Você não pode bloquear o próprio acesso' }, 400);
    }
    const { data: perfil } = await admin.from('perfis').select('id').eq('usuario', usuario).maybeSingle();
    if (!perfil) return resposta({ erro: 'Usuário não encontrado' }, 404);
    await admin.from('perfis').update({ ativo }).eq('id', perfil.id);
    // bloqueio no Auth também (encerra novos logins)
    await admin.auth.admin.updateUserById(perfil.id, { ban_duration: ativo ? 'none' : '876000h' });
    return resposta({ usuario, ativo });
  }

  return resposta({ erro: 'Ação desconhecida' }, 400);
});
