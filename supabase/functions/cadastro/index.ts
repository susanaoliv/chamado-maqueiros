// Edge Function pública: autocadastro de acesso.
// Ações (POST, sem login):
//   setores                                         → lista de setores ativos (para o formulário)
//   maqueiros                                       → maqueiros ativos ainda sem login (perfil Maqueiro)
//   cadastrar { nome, usuario, senha, papel, setor_id?, maqueiro_id? } → cria o login
// Regras:
//   - o PRIMEIRO cadastro do sistema (nenhum perfil existente) vira gestão já aprovada;
//   - os demais ficam aguardando aprovação da gestão (perfil inativo, sem acesso a nada).
// Publicar com verify_jwt = false (a função não depende de login e não dá acesso a dados).
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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return resposta({ erro: 'JSON inválido' }, 400);
  }

  if (body.acao === 'setores') {
    const { data, error } = await admin.from('setores').select('id, nome').eq('ativo', true).order('ordem').order('nome');
    if (error) return resposta({ erro: error.message }, 500);
    return resposta({ setores: data });
  }

  if (body.acao === 'maqueiros') {
    const [{ data: ms, error }, { data: vinculados }] = await Promise.all([
      admin.from('maqueiros').select('id, nome').eq('ativo', true).order('nome'),
      admin.from('perfis').select('maqueiro_id').not('maqueiro_id', 'is', null),
    ]);
    if (error) return resposta({ erro: error.message }, 500);
    const usados = new Set((vinculados ?? []).map((p) => p.maqueiro_id));
    return resposta({ maqueiros: (ms ?? []).filter((m) => !usados.has(m.id)) });
  }

  if (body.acao !== 'cadastrar') return resposta({ erro: 'Ação desconhecida' }, 400);

  const nome = String(body.nome ?? '').trim().slice(0, 60);
  const usuario = normalizarUsuario(String(body.usuario ?? ''));
  const senha = String(body.senha ?? '');
  let papel = String(body.papel ?? '');
  let setorId = body.setor_id ? String(body.setor_id) : null;
  let maqueiroId = body.maqueiro_id ? String(body.maqueiro_id) : null;

  if (nome.length < 3) return resposta({ erro: 'Informe seu nome.' }, 400);
  if (usuario.length < 3 || usuario.length > 40) return resposta({ erro: 'O usuário precisa ter de 3 a 40 letras ou números.' }, 400);
  if (senha.length < 8) return resposta({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
  if (!['gestao', 'telefonista', 'setor', 'maqueiro'].includes(papel)) return resposta({ erro: 'Escolha o perfil.' }, 400);
  if (papel === 'setor') {
    if (!setorId) return resposta({ erro: 'Escolha o setor.' }, 400);
    const { data: st } = await admin.from('setores').select('id').eq('id', setorId).eq('ativo', true).maybeSingle();
    if (!st) return resposta({ erro: 'Setor inválido.' }, 400);
  } else setorId = null;
  if (papel === 'maqueiro') {
    if (!maqueiroId) return resposta({ erro: 'Escolha seu nome na lista.' }, 400);
    const { data: mq } = await admin.from('maqueiros').select('id').eq('id', maqueiroId).eq('ativo', true).maybeSingle();
    if (!mq) return resposta({ erro: 'Maqueiro inválido.' }, 400);
    const { data: jaTem } = await admin.from('perfis').select('id').eq('maqueiro_id', maqueiroId).maybeSingle();
    if (jaTem) return resposta({ erro: 'Este maqueiro já tem acesso. Procure a gestão.' }, 409);
  } else maqueiroId = null;

  const { data: existente } = await admin.from('perfis').select('id').eq('usuario', usuario).maybeSingle();
  if (existente) return resposta({ erro: 'Este usuário já existe. Escolha outro.' }, 409);

  // Primeiro cadastro do sistema: gestão já aprovada
  const { count } = await admin.from('perfis').select('id', { count: 'exact', head: true });
  const primeiro = (count ?? 0) === 0;
  if (primeiro) {
    papel = 'gestao';
    setorId = null;
    maqueiroId = null;
  }

  const { data: criado, error } = await admin.auth.admin.createUser({
    email: `${usuario}@${DOMINIO}`,
    password: senha,
    email_confirm: true,
    user_metadata: { usuario, papel, autocadastro: true },
  });
  if (error || !criado.user) {
    const msg = /already|registered|exists/i.test(error?.message ?? '') ? 'Este usuário já existe. Escolha outro.' : (error?.message ?? 'Falha ao criar o acesso.');
    return resposta({ erro: msg }, 400);
  }

  const { error: perfilErr } = await admin.from('perfis').insert({
    id: criado.user.id,
    usuario,
    papel,
    nome,
    setor_id: setorId,
    maqueiro_id: maqueiroId,
    ativo: primeiro,
    aprovado_em: primeiro ? new Date().toISOString() : null,
    aprovado_por: primeiro ? 'primeiro cadastro do sistema' : null,
  });
  if (perfilErr) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return resposta({ erro: perfilErr.message }, 400);
  }

  return resposta({ usuario, papel, aprovado: primeiro });
});
