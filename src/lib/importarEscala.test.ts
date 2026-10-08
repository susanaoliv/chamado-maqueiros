import { describe, expect, it } from 'vitest';
import { casarMaqueiro, interpretarCelula, lerCsv, lerGradeEscala } from './importarEscala';

const maqueiros = [
  { id: '1', nome: 'JOÃO GUILHERME DOS ANJOS' },
  { id: '2', nome: 'JAELSON GOMES DA SILVA' },
  { id: '3', nome: 'COOPESERV – CARLOS' },
  { id: '4', nome: 'JOAO BATISTA DE SOUSA JUNIOR' },
];

describe('importação da escala', () => {
  it('interpreta as células', () => {
    expect(interpretarCelula('D')).toBe('D');
    expect(interpretarCelula(' n ')).toBe('N');
    expect(interpretarCelula('FÉRIAS')).toBe('F');
    expect(interpretarCelula('INSS')).toBe('F');
    expect(interpretarCelula('')).toBeNull();
    expect(interpretarCelula('folga')).toBeNull();
    expect(interpretarCelula('XYZ')).toBe('ignorar');
  });
  it('casa nomes da planilha com o cadastro', () => {
    expect(casarMaqueiro('Joao Guilherme', maqueiros)?.id).toBe('1');
    expect(casarMaqueiro('JAELSON GOMES DA SILVA', maqueiros)?.id).toBe('2');
    expect(casarMaqueiro('CARLOS', maqueiros)?.id).toBe('3');
    expect(casarMaqueiro('JOAO BATISTA', maqueiros)?.id).toBe('4');
    expect(casarMaqueiro('FULANO', maqueiros)).toBeNull();
  });
  it('lê a grade do CSV no layout da planilha oficial', () => {
    const dias = Array.from({ length: 31 }, (_, i) => i + 1);
    const csv = [
      'ESCALA MAQUEIROS – CASA DE SAÚDE SÃO LUCAS;;' + ';'.repeat(30),
      `NOME;HORÁRIO;${dias.join(';')}`,
      `JOÃO GUILHERME DOS ANJOS;09:00 ÀS 21:00;D;;D;;${Array(27).fill('FÉRIAS').join(';')}`,
      `JAELSON GOMES DA SILVA;19:00 ÀS 07:00;${dias.map((d) => (d % 2 ? 'N' : '')).join(';')}`,
      'LEGENDA: D = diurno;;',
    ].join('\n');
    const r = lerGradeEscala(lerCsv(csv), maqueiros, 31);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ maqueiroId: '1', horario: '09:00 ÀS 21:00' });
    expect(r[0].dias[1]).toBe('D');
    expect(r[0].dias[2]).toBeNull();
    expect(r[0].dias[5]).toBe('F');
    expect(r[1].dias[1]).toBe('N');
    expect(r[1].dias[2]).toBeNull();
  });
  it('acusa planilha sem linha de dias', () => {
    expect(() => lerGradeEscala([['a', 'b']], maqueiros, 31)).toThrow(/dias do mês/);
  });
});
