// Leitura da planilha mensal "ESCALA MAQUEIROS – CASA DE SAÚDE SÃO LUCAS":
// uma linha por maqueiro, coluna com o nome, coluna com o horário e uma coluna por dia (1..31)
// com D / N / E / FÉRIAS (ou vazio = folga).
import { normalizar, type TipoEscala } from './regras';

export type LinhaImportada = {
  nomePlanilha: string;
  horario: string | null;
  dias: Record<number, TipoEscala>;
  maqueiroId: string | null;
  maqueiroNome: string | null;
};

const FOLGA = ['fo', 'fg', 'folga', 'dsr', '-'];

export function interpretarCelula(v: unknown): TipoEscala | 'ignorar' {
  const s = normalizar(String(v ?? ''));
  if (!s) return null;
  if (['d', 'sd', 'diurno'].includes(s)) return 'D';
  if (['n', 'sn', 'noturno'].includes(s)) return 'N';
  if (['e', 'extra', 'he', 'folgatrabalhada'].includes(s)) return 'E';
  if (FOLGA.includes(s)) return null;
  if (s === 'f' || s === 'at' || ['fer', 'inss', 'afast', 'licen', 'atestado'].some((x) => s.includes(x))) return 'F';
  return 'ignorar';
}

/** Encontra a linha de cabeçalho com os dias 1..N (N ≥ 28). */
function acharCabecalho(linhas: unknown[][]) {
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const mapa = new Map<number, number>();
    linhas[i].forEach((c, idx) => {
      const n = Number(String(c ?? '').trim());
      if (Number.isInteger(n) && n >= 1 && n <= 31 && !mapa.has(n)) mapa.set(n, idx);
    });
    if (mapa.size >= 28 && mapa.has(1) && mapa.has(28)) return { linha: i, dias: mapa };
  }
  return null;
}

export function lerGradeEscala(linhas: unknown[][], maqueiros: { id: string; nome: string }[], diasNoMes: number) {
  const cab = acharCabecalho(linhas);
  if (!cab) throw new Error('Não encontrei a linha com os dias do mês (1, 2, 3 … 28/31) na planilha.');
  const header = linhas[cab.linha].map((c) => normalizar(String(c ?? '')));
  const primeiraColDia = Math.min(...cab.dias.values());
  let colNome = header.findIndex((h) => h.includes('nome') || h.includes('maqueiro') || h.includes('colaborador') || h.includes('funcionario'));
  const colHorario = header.findIndex((h) => h.includes('horario') || h.includes('hora') || h.includes('turno'));
  if (colNome < 0) {
    // primeira coluna antes dos dias com texto na maioria das linhas
    colNome = 0;
    for (let c = 0; c < primeiraColDia; c++) {
      const textos = linhas.slice(cab.linha + 1).filter((l) => /[a-zA-Z]{3,}/.test(String(l[c] ?? ''))).length;
      if (textos > 0) {
        colNome = c;
        break;
      }
    }
  }

  const resultado: LinhaImportada[] = [];
  for (const l of linhas.slice(cab.linha + 1)) {
    const nome = String(l[colNome] ?? '').trim();
    if (!nome || !/[a-zA-Z]{3,}/.test(nome)) continue;
    const dias: Record<number, TipoEscala> = {};
    let algum = false;
    for (let d = 1; d <= diasNoMes; d++) {
      const col = cab.dias.get(d);
      if (col === undefined) continue;
      const t = interpretarCelula(l[col]);
      if (t === 'ignorar') continue;
      dias[d] = t;
      if (t) algum = true;
    }
    if (!algum && !String(l[colHorario] ?? '').trim()) continue; // linha de rodapé/legenda
    const m = casarMaqueiro(nome, maqueiros);
    resultado.push({
      nomePlanilha: nome,
      horario: colHorario >= 0 ? String(l[colHorario] ?? '').trim() || null : null,
      dias,
      maqueiroId: m?.id ?? null,
      maqueiroNome: m?.nome ?? null,
    });
  }
  return resultado;
}

/** Casa o nome da planilha com o cadastro: igual, contido, ou mesmo primeiro + segundo nome. */
export function casarMaqueiro<T extends { id: string; nome: string }>(nome: string, maqueiros: T[]): T | null {
  const n = normalizar(nome);
  const exato = maqueiros.find((m) => normalizar(m.nome) === n);
  if (exato) return exato;
  const contido = maqueiros.filter((m) => normalizar(m.nome).includes(n) || n.includes(normalizar(m.nome)));
  if (contido.length === 1) return contido[0];
  const partes = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((p) => p.length > 2 && !['das', 'dos', 'coopeserv'].includes(p));
  const p = partes(nome);
  if (p.length === 0) return null;
  const candidatos = maqueiros.filter((m) => {
    const q = partes(m.nome);
    return q[0] === p[0] && (p.length === 1 || q.includes(p[1]));
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

/** CSV simples (separador ; ou ,) → matriz. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, '');
  const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) >= (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

/** XLSX → matriz (primeira aba com cabeçalho de dias), resolvendo células mescladas. */
export async function lerXlsx(arquivo: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo);
  for (const ws of wb.worksheets) {
    const linhas: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const l: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c);
        let v: unknown = cell.isMerged ? cell.master.value : cell.value;
        if (v && typeof v === 'object' && 'richText' in (v as object)) v = (v as { richText: { text: string }[] }).richText.map((x) => x.text).join('');
        if (v && typeof v === 'object' && 'result' in (v as object)) v = (v as { result: unknown }).result;
        if (v instanceof Date) v = v.getUTCDate();
        l.push(v ?? '');
      }
      linhas[r - 1] = l;
    });
    const densas = Array.from(linhas, (l) => l ?? []);
    if (acharCabecalho(densas)) return densas;
  }
  throw new Error('Nenhuma aba da planilha tem a linha com os dias do mês.');
}
