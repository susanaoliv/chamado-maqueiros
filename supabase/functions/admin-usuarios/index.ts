// Edge Function: gestão de acessos (somente perfil "gestao").
// Ações:
//   listar                                  → perfis cadastrados
//   criar     { usuario, papel, nome, setor_id?, perfil_acesso_id? }  → cria login com a senha padrão
//   redefinir { usuario }                   → volta a senha para o padrão
// Senha padrão: usuario + "@2026" (ex.: uti1@2026). Cada um pode trocar em "Minha senha".
//   ativar    { usuario, ativo }            → aprova/desbloqueia ou recusa/bloqueia o login (nunca exclui)
//   alterar   { usuario, papel, setor_id?, maqueiro_id?, nome?, perfil_acesso_id? } → ajusta perfil e setor (ex.: ao aprovar um autocadastro)
// perfil_acesso_id = perfil personalizado (Configurações → Perfis); o papel tem que ser o nível desse perfil.
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

// Senha padrão definida pela gestão: nome do usuário + "@2026"
const SUFIXO_SENHA = '@2026';
function senhaPadrao(usuario: string) {
  return `${usuario}${SUFIXO_SENHA}`;
}

function normalizarUsuario(u: string) {
  return u
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  if (userErr || !userData.user) return resposta({ erro: 'Sua sessão expirou. Entre de novo no sistema.', sessao_expirada: true }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: perfilChamador } = await admin
    .from('perfis')
    .select('papel, ativo, usuario, perfil_acesso_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!perfilChamador || perfilChamador.papel !== 'gestao' || !perfilChamador.ativo) {
    return resposta({ erro: 'Somente a gestão pode gerenciar acessos' }, 403);
  }
  // Perfil personalizado de nível gestão só gerencia acessos se tiver a tela Configurações.
  if (perfilChamador.perfil_acesso_id) {
    const { data: pa } = await admin.from('perfis_acesso').select('telas').eq('id', perfilChamador.perfil_acesso_id).maybeSingle();
    if (!pa || !(pa.telas as string[]).includes('configuracoes')) {
      return resposta({ erro: 'Seu perfil não tem acesso às Configurações' }, 403);
    }
  }

  // Confere o perfil personalizado escolhido: precisa existir, estar ativo e ser do mesmo nível do papel.
  async function perfilAcessoValido(id: string | null, papel: string): Promise<string | null> {
    if (!id) return null;
    const { data: pa } = await admin.from('perfis_acesso').select('papel_base, ativo, nome').eq('id', id).maybeSingle();
    if (!pa) return 'Perfil de acesso não encontrado';
    if (!pa.ativo) return `O perfil "${pa.nome}" está desativado`;
    if (pa.papel_base !== papel) return `O perfil "${pa.nome}" não confere com o nível escolhido`;
    return null;
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
      .select('id, usuario, papel, nome, setor_id, maqueiro_id, perfil_acesso_id, ativo, aprovado_em, aprovado_por, created_at')
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
    const maqueiroId = body.maqueiro_id ? String(body.maqueiro_id) : null;
    const perfilAcessoId = body.perfil_acesso_id ? String(body.perfil_acesso_id) : null;
    if (!usuario || usuario.length < 3) return resposta({ erro: 'Usuário inválido (mínimo 3 letras/números)' }, 400);
    if (!['gestao', 'telefonista', 'setor', 'maqueiro'].includes(papel)) return resposta({ erro: 'Papel inválido' }, 400);
    if (papel === 'setor' && !setorId) return resposta({ erro: 'Informe o setor' }, 400);
    if (papel === 'maqueiro' && !maqueiroId) return resposta({ erro: 'Informe o maqueiro' }, 400);
    const erroPerfil = await perfilAcessoValido(perfilAcessoId, papel);
    if (erroPerfil) return resposta({ erro: erroPerfil }, 400);

    const senha = senhaPadrao(usuario);
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
      maqueiro_id: papel === 'maqueiro' ? maqueiroId : null,
      perfil_acesso_id: perfilAcessoId,
      aprovado_em: new Date().toISOString(),
      aprovado_por: perfilChamador.usuario,
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
    // Gerar senha para si mesmo derrubaria a própria sessão no meio do uso.
    if (usuario === perfilChamador.usuario) {
      return resposta({ erro: 'Para trocar a sua própria senha, use "Minha senha" no menu.' }, 400);
    }
    const { data: perfil } = await admin.from('perfis').select('id').eq('usuario', usuario).maybeSingle();
    if (!perfil) return resposta({ erro: 'Usuário não encontrado' }, 404);
    const senha = senhaPadrao(usuario);
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
    // aprovado_em marca que a gestão já decidiu (aprovou ou recusou) o acesso
    await admin
      .from('perfis')
      .update({ ativo, aprovado_em: new Date().toISOString(), aprovado_por: perfilChamador.usuario })
      .eq('id', perfil.id);
    // bloqueio no Auth também (encerra novos logins)
    await admin.auth.admin.updateUserById(perfil.id, { ban_duration: ativo ? 'none' : '876000h' });
    return resposta({ usuario, ativo });
  }

  if (acao === 'alterar') {
    const usuario = normalizarUsuario(String(body.usuario ?? ''));
    const papel = String(body.papel ?? '');
    const setorId = body.setor_id ? String(body.setor_id) : null;
    const maqueiroId = body.maqueiro_id ? String(body.maqueiro_id) : null;
    const nome = body.nome === undefined ? undefined : String(body.nome).trim();
    const perfilAcessoId = body.perfil_acesso_id ? String(body.perfil_acesso_id) : null;
    if (!['gestao', 'telefonista', 'setor', 'maqueiro'].includes(papel)) return resposta({ erro: 'Papel inválido' }, 400);
    if (papel === 'setor' && !setorId) return resposta({ erro: 'Informe o setor' }, 400);
    if (papel === 'maqueiro' && !maqueiroId) return resposta({ erro: 'Informe o maqueiro' }, 400);
    if (usuario === perfilChamador.usuario && (papel !== 'gestao' || perfilAcessoId !== perfilChamador.perfil_acesso_id)) {
      return resposta({ erro: 'Você não pode mudar o próprio perfil' }, 400);
    }
    const erroPerfil = await perfilAcessoValido(perfilAcessoId, papel);
    if (erroPerfil) return resposta({ erro: erroPerfil }, 400);
    const { data: perfil } = await admin.from('perfis').select('id').eq('usuario', usuario).maybeSingle();
    if (!perfil) return resposta({ erro: 'Usuário não encontrado' }, 404);
    const dados: Record<string, unknown> = {
      papel,
      setor_id: papel === 'setor' ? setorId : null,
      maqueiro_id: papel === 'maqueiro' ? maqueiroId : null,
      perfil_acesso_id: perfilAcessoId,
    };
    if (nome) dados.nome = nome;
    const { error } = await admin.from('perfis').update(dados).eq('id', perfil.id);
    if (error) return resposta({ erro: error.message }, 400);
    return resposta({ usuario, papel });
  }

  return resposta({ erro: 'Ação desconhecida' }, 400);
});
