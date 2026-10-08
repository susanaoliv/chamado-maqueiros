// Exportação de tabelas em CSV, Excel (.xlsx) e PDF. As mesmas linhas mostradas na tela
// são passadas para cá, garantindo que o arquivo confere com o que se vê.

export type Coluna<T> = { titulo: string; valor: (l: T) => string | number | null | undefined };
export type Secao<T = any> = { titulo: string; colunas: Coluna<T>[]; linhas: T[] };

const celula = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : v);

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function gerarCsv(secoes: Secao[]) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(celula(v));
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const partes: string[] = [];
  for (const s of secoes) {
    if (secoes.length > 1) partes.push(esc(s.titulo));
    partes.push(s.colunas.map((c) => esc(c.titulo)).join(';'));
    for (const l of s.linhas) partes.push(s.colunas.map((c) => esc(c.valor(l))).join(';'));
    partes.push('');
  }
  // BOM para o Excel reconhecer UTF-8; separador ";" (padrão pt-BR)
  return '\uFEFF' + partes.join('\r\n');
}

export function exportarCsv(nome: string, secoes: Secao[]) {
  baixar(new Blob([gerarCsv(secoes)], { type: 'text/csv;charset=utf-8' }), `${nome}.csv`);
}

export async function exportarXlsx(nome: string, secoes: Secao[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Chamados de Maqueiros · CSSL';
  const usados = new Set<string>();
  for (const s of secoes) {
    let aba = s.titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Planilha';
    let i = 2;
    while (usados.has(aba)) aba = `${aba.slice(0, 28)} ${i++}`;
    usados.add(aba);
    const ws = wb.addWorksheet(aba);
    ws.addRow(s.colunas.map((c) => c.titulo));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE9FB' } };
    for (const l of s.linhas) ws.addRow(s.colunas.map((c) => celula(c.valor(l))));
    ws.columns.forEach((col, idx) => {
      const largura = Math.max(s.colunas[idx]?.titulo.length ?? 10, ...s.linhas.slice(0, 200).map((l) => String(celula(s.colunas[idx]?.valor(l))).length));
      col.width = Math.min(60, Math.max(8, largura + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${nome}.xlsx`);
}

export async function exportarPdf(nome: string, titulo: string, subtitulo: string, secoes: Secao[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(titulo, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(subtitulo, 40, 56);
  doc.setTextColor(0);
  let y = 72;
  for (const s of secoes) {
    if (y > 500) {
      doc.addPage();
      y = 40;
    }
    doc.setFontSize(11);
    doc.text(s.titulo, 40, y + 12);
    autoTable(doc, {
      startY: y + 18,
      head: [s.colunas.map((c) => c.titulo)],
      body: s.linhas.map((l) => s.colunas.map((c) => String(celula(c.valor(l))))),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [29, 111, 216] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Casa de Saúde São Lucas · Chamados de Maqueiros · página ${i}/${paginas}`, 40, doc.internal.pageSize.getHeight() - 20);
  }
  doc.save(`${nome}.pdf`);
}

export const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '' : Number(v.toFixed(1)));
