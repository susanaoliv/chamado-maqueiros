#!/usr/bin/env node
// Cria os usuários iniciais (gestao, telefonista e um por setor ativo) com senhas aleatórias.
// Uso (NUNCA no navegador; a service_role dá acesso total ao banco):
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-usuarios.mjs
// Gera usuarios-iniciais.csv (está no .gitignore). Entregue as senhas por canal seguro e apague o arquivo.
// Usuários que já existem são ignorados (não troca a senha).
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const DOMINIO = 'maqueiros.cssl';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const normalizar = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function senha(n = 10) {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => c[randomInt(c.length)]).join('');
}

const { data: setores, error } = await admin.from('setores').select('id, nome').eq('ativo', true).order('ordem');
if (error) throw error;
const { data: existentes } = await admin.from('perfis').select('usuario');
const jaExiste = new Set((existentes ?? []).map((p) => p.usuario));

const alvo = [
  { usuario: 'gestao', papel: 'gestao', nome: 'Gestão', setor_id: null },
  { usuario: 'telefonista', papel: 'telefonista', nome: 'Central de Telefonistas', setor_id: null },
  ...setores
    .filter((s) => !['Outros', 'Necrotério'].includes(s.nome))
    .map((s) => ({ usuario: normalizar(s.nome), papel: 'setor', nome: s.nome, setor_id: s.id })),
];

const linhas = ['usuario;papel;nome;senha'];
for (const u of alvo) {
  if (jaExiste.has(u.usuario)) {
    console.log(`= ${u.usuario} já existe, mantido`);
    continue;
  }
  const s = senha();
  const { data, error: e1 } = await admin.auth.admin.createUser({
    email: `${u.usuario}@${DOMINIO}`,
    password: s,
    email_confirm: true,
    user_metadata: { usuario: u.usuario, papel: u.papel },
  });
  if (e1) {
    console.error(`✗ ${u.usuario}: ${e1.message}`);
    continue;
  }
  const { error: e2 } = await admin.from('perfis').insert({ id: data.user.id, ...u });
  if (e2) {
    console.error(`✗ perfil ${u.usuario}: ${e2.message}`);
    await admin.auth.admin.deleteUser(data.user.id);
    continue;
  }
  linhas.push(`${u.usuario};${u.papel};${u.nome};${s}`);
  console.log(`✓ ${u.usuario}`);
}
writeFileSync('usuarios-iniciais.csv', linhas.join('\n') + '\n', { mode: 0o600 });
console.log('\nSenhas gravadas em usuarios-iniciais.csv (entregar por canal seguro e apagar).');
