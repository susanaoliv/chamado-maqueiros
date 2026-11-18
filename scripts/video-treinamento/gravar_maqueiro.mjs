// Grava o passo a passo do app do maqueiro (dados fictícios), no ritmo da narração.
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

// ---------------------------------------------------------------- dados simulados (maqueiro fictício)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 7200;
const uid = '44444444-4444-4444-4444-444444444444';
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated' })}.x`;
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'carlos@maqueiros.cssl', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const iso = (minAtras) => new Date(Date.now() - minAtras * 60000).toISOString();
const daqui = (seg) => new Date(Date.now() + seg * 1000).toISOString();
const ch = (o) => ({ id: 'c', numero: 'CH-2026-000160', aberto_em: iso(1), tipo: 'Exame', prioridade: 'Rotina', recurso: 'Maca', precisa_isolamento: false,
  precisa_oxigenio: false, observacao: null, status: 'aguardando_maqueiro', setor_origem: 'São José', leito_origem: '12', setor_destino: 'Tomografia',
  leito_destino: null, paciente: 'J. S.', maqueiro_informado_em: null, inicio_atendimento_em: null, ...o });
const S = { jornada: null, intervalo: null, ofertas: [], ativo: null, concluidos: 6, minutos: 84, recusas: 0 };
const estado = () => ({ agora: new Date().toISOString(), sla_minutos: 20, oferta_timeout_s: 90, hospital_configurado: true,
  maqueiro: { id: 'm9', nome: 'CARLOS ALBERTO SOUZA', setor_atuacao: 'Hospital', horario_inicio: '07:00', horario_fim: '19:00' },
  em_plantao: true, indisponivel: false, jornada: S.jornada, intervalo: S.intervalo, ofertas: S.ofertas, chamado_ativo: S.ativo,
  hoje: { concluidos: S.concluidos, minutos: S.minutos }, recusas_hoje: S.recusas });

async function rotas(page) {
  await page.route('http://localhost:9999/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const a = (() => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } })();
    if (u.pathname.startsWith('/auth/v1/token')) return json({ access_token: jwt, token_type: 'bearer', expires_in: 7200, expires_at: exp, refresh_token: 'r', user });
    if (u.pathname.startsWith('/auth/v1/user')) return json(user);
    if (u.pathname === '/rest/v1/perfis') {
      const eu = { id: uid, usuario: 'carlos', papel: 'maqueiro', setor_id: null, maqueiro_id: 'm9', nome: 'Carlos', ativo: true, aprovado_em: 'x', perfil_acesso_id: null, created_at: '' };
      return json(single ? eu : [eu]);
    }
    if (u.pathname === '/rest/v1/rpc/agora_servidor') return json(new Date().toISOString());
    if (u.pathname === '/rest/v1/rpc/app_maqueiro_estado') return json(estado());
    if (u.pathname === '/rest/v1/rpc/iniciar_jornada') { S.jornada = { id: 'j1', inicio: new Date().toISOString() }; return json(S.jornada); }
    if (u.pathname === '/rest/v1/rpc/encerrar_jornada') { S.jornada = null; return json({}); }
    if (u.pathname === '/rest/v1/rpc/definir_intervalo') { S.intervalo = a.p_em_intervalo ? { id: 'i1', inicio: new Date().toISOString() } : null; return json({}); }
    if (u.pathname === '/rest/v1/rpc/recusar_oferta') { S.ofertas = S.ofertas.filter((o) => o.id !== a.p_oferta_id); S.recusas++; return json({}); }
    if (u.pathname === '/rest/v1/rpc/aceitar_oferta') {
      const o = S.ofertas.find((x) => x.id === a.p_oferta_id);
      S.ofertas = [];
      S.ativo = { ...o.chamado, status: 'maqueiro_acionado', maqueiro_informado_em: new Date().toISOString() };
      return json(S.ativo);
    }
    if (u.pathname === '/rest/v1/rpc/mudar_status') {
      S.ativo = { ...S.ativo, status: a.p_status, inicio_atendimento_em: S.ativo.inicio_atendimento_em ?? new Date().toISOString() };
      return json(S.ativo);
    }
    if (u.pathname === '/rest/v1/rpc/encerrar_chamado') { S.ativo = null; S.concluidos++; S.minutos += 9; return json({}); }
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
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'pt-BR', timezoneId: 'America/Fortaleza',
  geolocation: { latitude: -5.8013, longitude: -35.2105, accuracy: 15 }, permissions: ['geolocation'],
});
await ctx.addInitScript(WS_FAKE);
const page = await ctx.newPage();
page.on('dialog', (d) => setTimeout(() => d.accept(), 1800));
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
const avisar = () => page.evaluate(() => window.__mudou('ofertas'));

// Abertura
cena('App do maqueiro');
await fala('abertura1');
await fala('abertura2');

// Entrar
cena('1. Entrar no app');
await fala('login1', async () => { await espera(3000); await digitar(page.getByLabel('Usuário'), 'carlos'); });
await fala('login2', async () => { await digitar(page.getByLabel('Senha'), 'carlos@2026'); });
cena('2. Instalar como app');
await fala('instalar1', async () => { await espera(1200); await tocar(page.getByRole('button', { name: 'Instalar app' })); });
await page.keyboard.press('Escape');
await espera(400);
await fala('entrar', async () => { await tocar(page.getByRole('button', { name: 'Entrar' })); await espera(1500); });

// Jornada
cena('3. Iniciar a jornada');
await fala('jornada1', async () => { await page.getByRole('button', { name: 'INICIAR JORNADA' }).hover(); });
await fala('jornada2', async () => { await espera(2500); await tocar(page.getByRole('button', { name: 'INICIAR JORNADA' })); await espera(1200); });
await fala('jornada3');

// Livre
cena('4. Livre, aguardando chamado');
await fala('livre1', async () => { await espera(2500); const b = page.getByRole('button', { name: /ativar o som/i }); if (await b.count()) await tocar(b); });
await fala('livre2');

// Oferta
cena('5. Chegou um chamado');
await fala('oferta1', async () => {
  S.ofertas = [{ id: 'o1', enviada_em: new Date().toISOString(), expira_em: daqui(90), urgente: false,
    chamado: ch({ id: 'c160', numero: 'CH-2026-000160', precisa_oxigenio: true, observacao: 'Paciente com acesso venoso' }) }];
  await avisar();
});
await fala('oferta2');
cena('6. Recusar (com motivo)');
await fala('recusa1', async () => {
  await tocar(page.getByRole('button', { name: 'Recusar' }));
  await espera(1200);
  await page.getByLabel('Motivo').selectOption('Longe do setor');
});
await fala('recusa2');
await page.getByRole('button', { name: 'Voltar' }).click();
await espera(500);
cena('7. Aceitar');
await fala('aceite1', async () => { await espera(1500); await tocar(page.getByRole('button', { name: 'ACEITAR' })); await espera(800); });

// Etapas
cena('8. Etapas do transporte');
await fala('etapa1', async () => { await espera(2500); await tocar(page.getByRole('button', { name: /CHEGUEI/ })); await espera(800); });
await fala('etapa2', async () => { await espera(3500); await tocar(page.getByRole('button', { name: 'Aguardando enfermagem' })); await espera(800); });
await fala('etapa3', async () => { await espera(1200); await tocar(page.getByRole('button', { name: 'RETOMAR TRANSPORTE' })); await espera(800); });

// Concluir
cena('9. Concluir o chamado');
await fala('concluir1', async () => {
  await tocar(page.getByRole('button', { name: 'CONCLUIR CHAMADO' }));
  await espera(1800);
  await tocar(page.getByRole('button', { name: 'Concluir', exact: true }));
  await espera(800);
});
await fala('concluir2');
await fala('concluir3', async () => { await page.mouse.wheel(0, 400); await espera(2000); });
await page.mouse.wheel(0, -600);

// Urgente
cena('10. Chamado urgente');
await fala('urgente1', async () => {
  S.ofertas = [{ id: 'o2', enviada_em: new Date().toISOString(), expira_em: daqui(90), urgente: true,
    chamado: ch({ id: 'c161', numero: 'CH-2026-000161', prioridade: 'Urgente', setor_origem: 'PS', leito_origem: null, setor_destino: 'UTI 1', leito_destino: '03', precisa_isolamento: true, paciente: 'M. A. L.' }) }];
  await avisar();
});
await fala('urgente2', async () => { await espera(3200); S.ofertas = []; await avisar(); });
await fala('cc1');

// Intervalo
cena('11. Intervalo');
await fala('intervalo1', async () => { await espera(2500); await tocar(page.getByRole('button', { name: 'Iniciar intervalo' })); await espera(800); });
await fala('intervalo2', async () => { await espera(2500); await tocar(page.getByRole('button', { name: 'Voltar do intervalo' })); await espera(800); });

// Encerrar
cena('12. Encerrar a jornada');
await fala('encerrar1', async () => { await espera(2000); await tocar(page.getByRole('button', { name: 'Encerrar jornada' })); await espera(2600); });

// Fim
cena('App do maqueiro');
await fala('fim1');
await espera(800);

await cdp.send('Page.stopScreencast');
const fimTotal = agora();
await ctx.close();
await browser.close();
srv.close();
fs.writeFileSync(path.join(OUT, 'linhas.json'), JSON.stringify({ fimTotal, quadros, linhas }, null, 2));
console.log('quadros', quadros.length, 'falas', linhas.length, 'duração', (fimTotal / 1000).toFixed(1) + 's');
