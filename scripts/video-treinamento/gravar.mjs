// Grava o passo a passo do perfil Enfermagem (dados fictícios), no ritmo da narração.
import { chromium } from '/home/user/chamado-maqueiros/node_modules/playwright-core/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2], OUT = process.argv[3], FALAS = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
fs.mkdirSync(path.join(OUT, 'q'), { recursive: true });
const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = path.join(DIST, req.url.split('?')[0]);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
  res.setHeader('content-type', TIPOS[path.extname(p)] || 'application/octet-stream');
  res.end(fs.readFileSync(p));
}).listen(4320);

// ---------------------------------------------------------------- dados simulados
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7200;
const uid = '33333333-3333-3333-3333-333333333333';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated' })}.x`;
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'uti1@maqueiros.cssl', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const setores = ['PS', 'Centro Cirúrgico', 'Tomografia', 'UTI 1', 'São José', 'Necrotério', 'Ressonância', 'Hemodinâmica'].map((n, i) => ({
  id: 's' + i, nome: n, ativo: true, exige_leito: ['UTI 1', 'São José'].includes(n), ordem: i, created_at: '',
}));
const iso = (minAtras) => new Date(Date.now() - minAtras * 60000).toISOString();
const hoje = new Date().toISOString().slice(0, 10);
const base = {
  setor_origem_id: 's3', setor_origem_nome: 'UTI 1', destino_outro: null, leito_destino: null, origem_chamado: 'Setor (enfermagem)', recurso: 'Maca',
  precisa_isolamento: false, precisa_oxigenio: false, observacao: null, maqueiro_id: null, maqueiro_nome: null, maqueiro_informado_em: null,
  inicio_atendimento_em: null, encerrado_em: null, motivo_atraso: null, motivo_atraso_texto: null, cancelado_em: null, cancelado_motivo: null,
  cancelado_por: null, criado_por: 'Enf. Ana (uti1)', encerrado_por: null, created_at: '', data_local: hoje, hora: 9, dia_semana: 4, turno: 'Diurno',
  min_acionamento: null, min_acionamento_atendimento: null, min_total: null, sla_minutos: 20, atrasado: false, grupo_motivo_atraso: null,
  despacho_reiniciado_em: null, despacho_esgotado_em: null,
};
let chamados = [
  { ...base, id: 'c150', numero: 'CH-2026-000150', aberto_em: iso(6), tipo: 'Alta', setor_destino_id: null, setor_destino_nome: null, leito_origem: '07',
    prioridade: 'Rotina', status: 'aguardando_maqueiro', recurso: 'Cadeira de rodas', paciente: 'Maria Souza', solicitante: 'Enf. Ana' },
];
let novo = null;

async function rotas(page) {
  await page.route('http://localhost:9999/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (u.pathname.startsWith('/auth/v1/token')) return json({ access_token: jwt, token_type: 'bearer', expires_in: 7200, expires_at: exp, refresh_token: 'r', user });
    if (u.pathname.startsWith('/auth/v1/user')) return json(user);
    if (u.pathname === '/rest/v1/perfis') {
      const eu = { id: uid, usuario: 'uti1', papel: 'setor', setor_id: 's3', nome: 'UTI 1', ativo: true, aprovado_em: 'x', perfil_acesso_id: null, maqueiro_id: null, created_at: '' };
      return json(single ? eu : [eu]);
    }
    if (u.pathname === '/rest/v1/setores') return json(single ? setores[3] : u.searchParams.get('id') ? [setores[3]] : setores);
    if (u.pathname === '/rest/v1/configuracoes') return json([{ chave: 'sla_minutos', valor: 20 }, { chave: 'meta_acionamento_minutos', valor: 5 }]);
    if (u.pathname === '/rest/v1/rpc/agora_servidor') return json(new Date().toISOString());
    if (u.pathname === '/rest/v1/vw_chamados_metricas') return json(chamados);
    if (u.pathname === '/rest/v1/rpc/abrir_chamado') {
      const a = JSON.parse(req.postData() || '{}');
      novo = { ...base, id: 'c153', numero: 'CH-2026-000153', aberto_em: new Date().toISOString(), tipo: a.p_tipo, setor_destino_id: a.p_setor_destino_id,
        setor_destino_nome: setores.find((s) => s.id === a.p_setor_destino_id)?.nome ?? null, leito_origem: a.p_leito_origem, prioridade: a.p_prioridade,
        status: 'aguardando_maqueiro', paciente: a.p_paciente, solicitante: a.p_solicitante, recurso: a.p_recurso, precisa_oxigenio: a.p_precisa_oxigenio,
        precisa_isolamento: a.p_precisa_isolamento, observacao: a.p_observacao };
      chamados = [novo, ...chamados];
      return json(novo);
    }
    if (u.pathname === '/rest/v1/rpc/cancelar_chamado') {
      const a = JSON.parse(req.postData() || '{}');
      const c = chamados.find((x) => x.id === a.p_chamado_id);
      Object.assign(c, { status: 'cancelado', cancelado_em: new Date().toISOString(), cancelado_motivo: a.p_justificativa, cancelado_por: 'Enf. Ana (uti1)' });
      return json(c);
    }
    return json([]);
  });
}

// Conexão em tempo real simulada (o status muda sozinho, como no sistema real)
const WS_FAKE = `
(() => {
  const Original = window.WebSocket;
  class FakeWS {
    constructor(url) {
      if (!String(url).includes('localhost:9999')) return new Original(url);
      this.url = url; this.readyState = 0; this.binaryType = 'arraybuffer'; window.__ws = this;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 50);
    }
    send(raw) {
      if (typeof raw !== 'string') return;
      const [jr, ref, topic, event, payload] = JSON.parse(raw);
      if (event === 'phx_join') {
        const pcs = ((payload.config && payload.config.postgres_changes) || []).map((b, i) => ({ ...b, id: i + 1 }));
        this.topic = topic; this.pcs = pcs;
        this._msg([jr, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pcs } }]);
      } else {
        this._msg([jr, ref, topic, 'phx_reply', { status: 'ok', response: {} }]);
      }
    }
    _msg(a) { setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(a) }), 20); }
    close() { this.readyState = 3; this.onclose && this.onclose({ code: 1000 }); }
    addEventListener(t, f) { this['on' + t] = f; }
    removeEventListener() {}
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
  window.__mudou = (table = 'chamados') => {
    const w = window.__ws; if (!w || !w.pcs) return false;
    const ids = w.pcs.filter((p) => p.table === table).map((p) => p.id);
    w._msg([null, null, w.topic, 'postgres_changes', { ids, data: { schema: 'public', table, type: 'UPDATE', commit_timestamp: new Date().toISOString(), columns: [], record: {}, old_record: {} } }]);
    return true;
  };
})();
`;

// ---------------------------------------------------------------- linha do tempo
const t0 = { v: 0 };
const linhas = [];
const agora = () => Date.now() - t0.v;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let cenaAtual = '';
const cena = (titulo) => { cenaAtual = titulo; };
// Cada fala dura o tempo do áudio (+ respiro), ou mais se a ação na tela demorar.
async function fala(id, acao, msMin = 0) {
  const f = FALAS[id];
  if (!f) throw new Error('fala não encontrada: ' + id);
  const ini = agora();
  if (acao) await acao();
  const alvo = Math.max(f.dur_ms + 700, msMin);
  const restante = alvo - (agora() - ini);
  if (restante > 0) await espera(restante);
  linhas.push({ id, ini, fim: agora(), cena: cenaAtual, texto: f.legenda, wav: f.wav });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'pt-BR', timezoneId: 'America/Fortaleza' });
await ctx.addInitScript(WS_FAKE);
const page = await ctx.newPage();
await rotas(page);
const quadros = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
  const arq = path.join(OUT, 'q', `f${String(quadros.length).padStart(5, '0')}.jpg`);
  fs.writeFileSync(arq, Buffer.from(data, 'base64'));
  quadros.push({ t: agora(), arq });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
});
await page.goto('http://localhost:4320/login');
await page.waitForTimeout(1200);
t0.v = Date.now();
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
const digitar = async (loc, txt) => { await loc.click(); await loc.pressSequentially(txt, { delay: 70 }); };
const tocar = async (loc) => { await loc.scrollIntoViewIfNeeded(); await loc.hover(); await espera(250); await loc.click(); };

// CENA 1 · Abertura
cena('Chamados de Maqueiros · Enfermagem');
await fala('abertura1');
await fala('abertura2');

// CENA 2 · Entrar
cena('1. Entrar no sistema');
await fala('login1', async () => { await espera(2500); await digitar(page.getByLabel('Usuário'), 'uti1'); });
await fala('login2', async () => { await digitar(page.getByLabel('Senha'), 'uti1@2026'); });
await fala('login3', async () => { await digitar(page.getByLabel(/Seu nome/), 'Enf. Ana'); });

// CENA 3 · Instalar
cena('2. Instalar como app');
await fala('instalar1', async () => { await espera(1500); await tocar(page.getByRole('button', { name: 'Instalar app' })); });
await fala('instalar2');
await page.keyboard.press('Escape');
await espera(400);
await fala('entrar', async () => { await tocar(page.getByRole('button', { name: 'Entrar' })); await espera(1200); });

// CENA 4 · Tela do setor
cena('3. A tela do seu setor');
await fala('tela1', async () => { await page.getByTestId('novo-chamado').hover(); });
await fala('tela2', async () => { await espera(1500); await page.mouse.wheel(0, 200); });
await fala('tela3', async () => { await page.mouse.wheel(0, 400); await espera(2500); }, 0);
await page.mouse.wheel(0, -800);

// CENA 5 · Abrir chamado
cena('4. Abrindo um chamado');
await fala('novo1', async () => { await espera(1800); await tocar(page.getByTestId('novo-chamado')); });
await fala('novo2', async () => { await espera(4000); await page.getByLabel('Tipo de chamado').selectOption('Exame'); });
await fala('novo3', async () => { await espera(1500); await digitar(page.getByLabel(/leito de origem/i), '04'); });
await fala('novo4', async () => { await espera(1200); await page.getByLabel('Setor de destino').selectOption({ label: 'Tomografia' }); });
await fala('novo5', async () => {
  await digitar(page.getByLabel(/paciente/i), 'José da Silva');
  await digitar(page.getByLabel(/quem está solicitando/i), 'Enf. Ana');
});
await fala('novo6', async () => {
  await espera(1500);
  await page.getByLabel('Recurso necessário').selectOption('Maca');
  await espera(1500);
  await page.getByLabel('Prioridade').selectOption('Prioritário');
});
await fala('novo7', async () => {
  const sim = page.getByRole('radio', { name: 'Sim' });
  await sim.nth(1).scrollIntoViewIfNeeded();
  await espera(2500);
  await tocar(sim.nth(1));
});
await fala('novo8', async () => {
  await digitar(page.getByLabel('Observação'), 'Paciente com acesso venoso');
  await espera(800);
  await tocar(page.getByRole('button', { name: /registrar chamado/i }));
  await espera(800);
});
await fala('novo9');

// CENA 6 · Obrigatórios
cena('5. Campos obrigatórios');
await fala('obrig1', async () => {
  await tocar(page.getByTestId('novo-chamado'));
  await espera(1500);
  await tocar(page.getByRole('button', { name: /registrar chamado/i }));
  await espera(600);
  await page.locator('dialog .overflow-y-auto').evaluate((d) => d.scrollTo({ top: 220, behavior: 'smooth' }));
});
await fala('obrig2');
await page.keyboard.press('Escape');
await espera(500);

// CENA 7 · Acompanhar
cena('6. Acompanhando o chamado');
await fala('status0');
async function status(id, mudanca) {
  Object.assign(novo, mudanca);
  await fala(id, async () => {
    const ok = await page.evaluate(() => window.__mudou('chamados'));
    if (!ok) throw new Error('tempo real simulado não conectou');
  });
}
await status('status1', { status: 'maqueiro_acionado', maqueiro_id: 'm1', maqueiro_nome: 'ADSON GOMES DE ALBUQUERQUE', maqueiro_informado_em: new Date().toISOString(), min_acionamento: 2 });
await status('status2', { status: 'em_atendimento', inicio_atendimento_em: new Date().toISOString() });
await status('status3', { status: 'aguardando_enfermagem' });
await status('status4', { status: 'concluido', encerrado_em: new Date().toISOString(), min_total: 14 });
await fala('status5', async () => { await page.mouse.wheel(0, 500); });
await page.mouse.wheel(0, -800);
await espera(400);

// CENA 8 · Cancelar
cena('7. Cancelando um chamado');
await fala('cancel1', async () => { await espera(2500); await tocar(page.getByRole('button', { name: 'Cancelar chamado' }).first()); });
await fala('cancel2', async () => { await espera(1000); await digitar(page.getByLabel(/Justificativa/i), 'Exame remarcado pelo setor'); });
await fala('cancel3', async () => {
  await tocar(page.getByRole('button', { name: 'Confirmar cancelamento' }));
  await espera(1500);
  await page.mouse.wheel(0, 500);
});
await page.mouse.wheel(0, -800);

// CENA 9 · Menu
cena('8. Menu, senha e sair');
await fala('menu1', async () => { await tocar(page.getByRole('button', { name: 'Menu', exact: true })); });
await page.keyboard.press('Escape');
await espera(300);

// CENA 10 · Encerramento
cena('Chamados de Maqueiros · Enfermagem');
await fala('fim1', async () => { await page.goto('http://localhost:4320/login'); });
await espera(800);

await cdp.send('Page.stopScreencast');
const fimTotal = agora();
await ctx.close();
await browser.close();
srv.close();
fs.writeFileSync(path.join(OUT, 'linhas.json'), JSON.stringify({ fimTotal, quadros, linhas }, null, 2));
console.log('quadros', quadros.length, 'falas', linhas.length, 'duração', (fimTotal / 1000).toFixed(1) + 's');
