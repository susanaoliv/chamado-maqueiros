import { describe, expect, it } from 'vitest';
import {
  destinoTravadoNecroterio,
  destinoVisivel,
  emPlantao,
  estaAtrasado,
  exigeMotivoAtraso,
  leitoOrigemObrigatorio,
  normalizar,
  paraArgsRpc,
  proximoTipoEscala,
  schemaEncerramento,
  schemaNovoChamado,
  setorExigeLeito,
  turnoDoDia,
  valoresPadrao,
  DESTINO_OUTRO,
} from './regras';

const setores = [
  { id: 'ps', nome: 'PS', exige_leito: false },
  { id: 'sj', nome: 'São José', exige_leito: true },
  { id: 'uti1', nome: 'UTI 1', exige_leito: false }, // flag desligada, mas a lista oficial exige
  { id: 'tomo', nome: 'Tomografia', exige_leito: false },
  { id: 'nec', nome: 'Necrotério', exige_leito: false },
];
const ctx: { setores: typeof setores; papel: 'gestao' | 'telefonista' | 'setor'; somenteNumeroAtendimento: boolean } = { setores, papel: 'telefonista', somenteNumeroAtendimento: false };
const base = { ...valoresPadrao(), setor_origem_id: 'ps', setor_destino_id: 'tomo', paciente: 'Fulano' };
const erros = (v: object, c = ctx) => {
  const r = schemaNovoChamado(c).safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('normalização de nomes', () => {
  it('ignora acento, caixa e espaço', () => {
    expect(normalizar('São José')).toBe('saojose');
    expect(normalizar('  sao  JOSE ')).toBe('saojose');
    expect(normalizar('Nossa Senhora de Fátima')).toBe(normalizar('nossa senhora de fatima'));
  });
});

describe('leito de origem obrigatório', () => {
  it('nos 12 setores da lista, para qualquer tipo', () => {
    expect(setorExigeLeito({ nome: 'sao jose', exige_leito: false })).toBe(true);
    expect(setorExigeLeito({ nome: 'UTI 3', exige_leito: false })).toBe(true);
    expect(setorExigeLeito({ nome: 'Santa Isabel', exige_leito: false })).toBe(true);
    expect(leitoOrigemObrigatorio('Exame', { nome: 'TMO', exige_leito: false })).toBe(true);
    expect(leitoOrigemObrigatorio('Alta', { nome: 'Padre João Maria', exige_leito: false })).toBe(true);
  });
  it('opcional nos demais setores', () => {
    expect(leitoOrigemObrigatorio('Exame', { nome: 'PS', exige_leito: false })).toBe(false);
    expect(leitoOrigemObrigatorio('Exame', { nome: 'Tomografia', exige_leito: false })).toBe(false);
  });
  it('respeita a flag do cadastro', () => {
    expect(setorExigeLeito({ nome: 'Novo setor', exige_leito: true })).toBe(true);
  });
  it('validação do formulário', () => {
    expect(erros({ ...base, setor_origem_id: 'sj' })).toContain('leito_origem');
    expect(erros({ ...base, setor_origem_id: 'uti1' })).toContain('leito_origem');
    expect(erros({ ...base, setor_origem_id: 'sj', leito_origem: '12' })).toEqual([]);
    expect(erros(base)).toEqual([]);
  });
});

describe('regras por tipo', () => {
  it('Alta: destino não exigido e some', () => {
    expect(destinoVisivel('Alta')).toBe(false);
    expect(erros({ ...base, tipo: 'Alta', setor_destino_id: '' })).toEqual([]);
    const args = paraArgsRpc({ ...base, tipo: 'Alta', leito_destino: '3' }, setores, null);
    expect(args.p_setor_destino_id).toBeNull();
    expect(args.p_leito_destino).toBeNull();
  });
  it('Óbito: destino automático no Necrotério', () => {
    expect(destinoTravadoNecroterio('Óbito')).toBe(true);
    expect(erros({ ...base, tipo: 'Óbito', setor_destino_id: '' })).toEqual([]);
    expect(paraArgsRpc({ ...base, tipo: 'Óbito', setor_destino_id: 'tomo' }, setores, null).p_setor_destino_id).toBe('nec');
  });
  it('Transferência interna: leitos de origem e destino obrigatórios', () => {
    const e = erros({ ...base, tipo: 'Transferência interna' });
    expect(e).toContain('leito_origem');
    expect(e).toContain('leito_destino');
    expect(erros({ ...base, tipo: 'Transferência interna', leito_origem: '1', leito_destino: '2' })).toEqual([]);
  });
  it('demais tipos exigem destino; "Outro" exige descrição', () => {
    expect(erros({ ...base, setor_destino_id: '' })).toContain('setor_destino_id');
    expect(erros({ ...base, setor_destino_id: DESTINO_OUTRO })).toContain('destino_outro');
    const a = paraArgsRpc({ ...base, setor_destino_id: DESTINO_OUTRO, destino_outro: 'Clínica externa' }, setores, null);
    expect(a.p_setor_destino_id).toBeNull();
    expect(a.p_destino_outro).toBe('Clínica externa');
  });
  it('setor (enfermagem) precisa informar solicitante', () => {
    expect(erros(base, { ...ctx, papel: 'setor' })).toContain('solicitante');
    expect(erros({ ...base, solicitante: 'Enf. Ana' }, { ...ctx, papel: 'setor' })).toEqual([]);
  });
  it('somente nº do atendimento quando configurado', () => {
    const c = { ...ctx, somenteNumeroAtendimento: true };
    expect(erros(base, c)).toContain('paciente');
    expect(erros({ ...base, paciente: '123456' }, c)).toEqual([]);
  });
  it('gestão informando hora precisa justificar', () => {
    const c = { ...ctx, papel: 'gestao' as const };
    expect(erros({ ...base, aberto_em: '2026-10-08T08:00' }, c)).toContain('justificativa_hora');
  });
});

describe('SLA e atraso', () => {
  const agora = new Date('2026-10-08T12:00:00Z');
  it('aberto além do SLA está atrasado', () => {
    expect(estaAtrasado({ status: 'aguardando_maqueiro', aberto_em: '2026-10-08T11:30:00Z' }, 20, agora)).toBe(true);
    expect(estaAtrasado({ status: 'em_atendimento', aberto_em: '2026-10-08T11:45:00Z' }, 20, agora)).toBe(false);
  });
  it('concluído usa a hora de término; cancelado nunca atrasa', () => {
    expect(estaAtrasado({ status: 'concluido', aberto_em: '2026-10-08T10:00:00Z', encerrado_em: '2026-10-08T10:15:00Z' }, 20, agora)).toBe(false);
    expect(estaAtrasado({ status: 'cancelado', aberto_em: '2026-10-08T08:00:00Z' }, 20, agora)).toBe(false);
  });
  it('encerramento exige motivo acima do SLA', () => {
    expect(exigeMotivoAtraso('2026-10-08T11:39:00Z', 20, agora)).toBe(true);
    expect(exigeMotivoAtraso('2026-10-08T11:41:00Z', 20, agora)).toBe(false);
    expect(schemaEncerramento(true).safeParse({ motivo: '', texto: '' }).success).toBe(false);
    expect(schemaEncerramento(true).safeParse({ motivo: 'Outro', texto: '' }).success).toBe(false);
    expect(schemaEncerramento(true).safeParse({ motivo: 'Outro', texto: 'maca quebrada' }).success).toBe(true);
    expect(schemaEncerramento(true).safeParse({ motivo: 'Elevador indisponível', texto: '' }).success).toBe(true);
  });
});

describe('disponibilidade pela escala', () => {
  const H = (h: number, m = 0) => h * 60 + m;
  it('plantão diurno', () => {
    const t = turnoDoDia('07:00', '19:00', 'D', true);
    expect(emPlantao(H(7), t, null)).toBe(true);
    expect(emPlantao(H(18, 59), t, null)).toBe(true);
    expect(emPlantao(H(19), t, null)).toBe(false);
    expect(emPlantao(H(6, 59), t, null)).toBe(false);
  });
  it('plantão noturno atravessa a meia-noite (19h → 07h)', () => {
    const ontem = turnoDoDia('19:00', '07:00', 'N', true);
    expect(emPlantao(H(23, 30), ontem, null)).toBe(true);
    expect(emPlantao(H(6, 30), null, ontem)).toBe(true); // madrugada seguinte
    expect(emPlantao(H(7, 0), null, ontem)).toBe(false);
    expect(emPlantao(H(18, 0), ontem, null)).toBe(false);
  });
  it('N para maqueiro de horário diurno usa 19h–07h; D para noturno usa 07h–19h', () => {
    expect(turnoDoDia('07:00', '19:00', 'N', true)).toEqual({ inicio: H(19), fim: H(31) });
    expect(turnoDoDia('19:00', '07:00', 'D', true)).toEqual({ inicio: H(7), fim: H(19) });
  });
  it('folga, férias e mês sem escala', () => {
    expect(turnoDoDia('07:00', '19:00', null, true)).toBeNull();
    expect(turnoDoDia('07:00', '19:00', 'F', true)).toBeNull();
    expect(turnoDoDia('09:00', '21:00', null, false)).toEqual({ inicio: H(9), fim: H(21) }); // fallback
  });
  it('clique alterna D → N → E → F → vazio', () => {
    expect([null, 'D', 'N', 'E', 'F'].map((t) => proximoTipoEscala(t as never))).toEqual(['D', 'N', 'E', 'F', null]);
  });
});
