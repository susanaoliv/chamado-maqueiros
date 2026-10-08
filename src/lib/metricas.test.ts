import { describe, expect, it } from 'vitest';
import { agrupar, mapaCalor, mediana, motivosAtraso, percentil, porHora, resumo, type LinhaMetrica } from './metricas';
import { gerarCsv } from './exportar';

let n = 0;
const ch = (p: Partial<LinhaMetrica>): LinhaMetrica => ({
  id: String(n++),
  status: 'concluido',
  aberto_em: '2026-10-08T10:00:00Z',
  data_local: '2026-10-08',
  hora: 7,
  dia_semana: 4,
  turno: 'Diurno',
  tipo: 'Exame',
  setor_origem_nome: 'PS',
  setor_destino_nome: 'Tomografia',
  maqueiro_nome: 'A',
  origem_chamado: 'Telefone/central',
  recurso: 'Maca',
  precisa_isolamento: false,
  precisa_oxigenio: false,
  min_acionamento: 2,
  min_acionamento_atendimento: 3,
  min_total: 10,
  motivo_atraso: null,
  solicitante: null,
  ...p,
});

describe('estatísticas', () => {
  it('mediana e percentil', () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(percentil([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBeCloseTo(91);
    expect(mediana([])).toBeNull();
  });
});

describe('resumo', () => {
  const linhas = [
    ch({ min_total: 10 }),
    ch({ min_total: 30, motivo_atraso: 'Elevador indisponível', min_acionamento: 8 }),
    ch({ min_total: 25 }),
    ch({ status: 'cancelado', min_total: null, min_acionamento: null }),
    ch({ status: 'aguardando_maqueiro', min_total: null, min_acionamento: null, data_local: '2026-10-09' }),
  ];
  const r = resumo(linhas, 20, 5);
  it('conta e calcula % no prazo só sobre concluídos', () => {
    expect(r.total).toBe(5);
    expect(r.concluidos).toBe(3);
    expect(r.atrasados).toBe(2);
    expect(r.pctNoPrazo).toBeCloseTo(33.33, 1);
  });
  it('cancelados ficam fora dos tempos, mas entram na ineficiência', () => {
    expect(r.tempoMedio).toBeCloseTo((10 + 30 + 25) / 3);
    expect(r.cancelados).toBe(1);
    expect(r.pctCancelados).toBe(20);
  });
  it('ineficiência', () => {
    expect(r.minutosPerdidos).toBe(15);
    expect(r.atrasosSemJustificativa).toBe(1);
    expect(r.acimaMetaAcionamento).toBe(1);
    expect(r.aguardandoMaqueiro).toBe(1);
    expect(r.mediaDia).toBe(2.5);
  });
  it('motivos de atraso com minutos perdidos', () => {
    const m = motivosAtraso(linhas, 20);
    expect(m.find((x) => x.motivo === 'Elevador indisponível')).toMatchObject({ qtd: 1, minutos: 10, grupo: 'Elevador' });
    expect(m.find((x) => x.motivo === 'Sem justificativa')).toMatchObject({ qtd: 1, minutos: 5 });
  });
  it('agrupamento por maqueiro e por hora', () => {
    const g = agrupar(linhas, (c) => c.maqueiro_nome, 20);
    expect(g[0]).toMatchObject({ chave: 'A', total: 5, concluidos: 3, atrasados: 2, minutosAtendimento: 65 });
    expect(porHora(linhas, 20)[7].total).toBe(5);
    expect(porHora(linhas, 20)).toHaveLength(24);
  });
  it('mapa de calor só com horas que têm movimento', () => {
    const m = mapaCalor(linhas);
    expect(m.horas).toEqual([7]);
    expect(m.matriz[4][7]).toBe(5);
  });
});

describe('exportação CSV', () => {
  it('usa ; com BOM e escapa aspas', () => {
    const csv = gerarCsv([{ titulo: 'T', colunas: [{ titulo: 'A', valor: (l: { a: string }) => l.a }], linhas: [{ a: 'x;"y"' }] }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x;""y"""');
  });
});

describe('intervalos', () => {
  const l = (maqueiro_nome: string, minutos: number, hora: number, data_local = '2026-10-08', em_andamento = false) => ({ maqueiro_nome, minutos, hora, data_local, em_andamento });
  const linhas = [l('A', 15, 10), l('A', 30, 13), l('B', 20, 13, '2026-10-09', true)];
  it('resume total, média e maior', async () => {
    const { resumoIntervalos } = await import('./metricas');
    const r = resumoIntervalos(linhas);
    expect(r).toMatchObject({ total: 3, emAndamento: 1, minutosTotais: 65, maior: 30, dias: 2 });
    expect(r.media).toBeCloseTo(65 / 3);
  });
  it('agrupa por maqueiro (mais minutos primeiro) e por hora', async () => {
    const { intervalosPorMaqueiro, intervalosPorHora } = await import('./metricas');
    expect(intervalosPorMaqueiro(linhas)[0]).toMatchObject({ chave: 'A', qtd: 2, minutos: 45, media: 22.5, maior: 30 });
    expect(intervalosPorHora(linhas)[13].total).toBe(2);
  });
});
