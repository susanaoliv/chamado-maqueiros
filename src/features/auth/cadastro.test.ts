import { describe, expect, it } from 'vitest';
import { schemaCadastro } from './cadastro';

const base = { nome: 'Maria José', usuario: 'Maria', papel: 'telefonista' as const, setor_id: '', maqueiro_id: '', senha: '12345678', confirmacao: '12345678' };
const erros = (v: object) => {
  const r = schemaCadastro.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('cadastro de acesso', () => {
  it('normaliza o usuário (sem acento, espaço ou maiúscula)', () => {
    const r = schemaCadastro.parse({ ...base, usuario: 'João Paulo' });
    expect(r.usuario).toBe('joaopaulo');
  });
  it('exige senha de 8+ caracteres e confirmação igual', () => {
    expect(erros({ ...base, senha: '123', confirmacao: '123' })).toContain('senha');
    expect(erros({ ...base, confirmacao: 'outra123' })).toContain('confirmacao');
  });
  it('perfil setor exige setor', () => {
    expect(erros({ ...base, papel: 'setor' })).toContain('setor_id');
    expect(erros({ ...base, papel: 'setor', setor_id: 'abc' })).toEqual([]);
  });
  it('perfil maqueiro exige o nome da escala', () => {
    expect(erros({ ...base, papel: 'maqueiro' })).toContain('maqueiro_id');
    expect(erros({ ...base, papel: 'maqueiro', maqueiro_id: 'm1' })).toEqual([]);
  });
  it('usuário e nome mínimos', () => {
    expect(erros({ ...base, usuario: 'ab' })).toContain('usuario');
    expect(erros({ ...base, nome: 'A' })).toContain('nome');
    expect(erros(base)).toEqual([]);
  });
});
