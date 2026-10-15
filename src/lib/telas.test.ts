import { describe, expect, it } from 'vitest';
import { atalhosCelular, TELAS, TELAS_DO_NIVEL, telasPermitidas } from './telas';
import { resolverOpcaoPerfil, valorOpcaoPerfil } from '@/features/config/PerfisAcesso';
import type { PerfilAcesso } from '@/types/database';

const diretoria: PerfilAcesso = {
  id: 'p1', nome: 'Diretoria', descricao: null, papel_base: 'gestao', telas: ['relatorios', 'dashboard'], ativo: true, created_at: '',
};

describe('telas por perfil', () => {
  it('perfis padrão mantêm as telas de antes', () => {
    expect(telasPermitidas('gestao', null).map((t) => t.id)).toEqual(TELAS_DO_NIVEL.gestao);
    expect(telasPermitidas('telefonista', null).map((t) => t.id)).toEqual(['central', 'painel', 'maqueiros', 'registros']);
    expect(telasPermitidas('setor', null).map((t) => t.id)).toEqual(['meus-chamados']);
    expect(telasPermitidas('maqueiro', null)).toEqual([]);
  });

  it('perfil personalizado mostra só as telas marcadas, na ordem do menu', () => {
    expect(telasPermitidas('gestao', diretoria).map((t) => t.id)).toEqual(['dashboard', 'relatorios']);
  });

  it('nunca libera tela acima do nível, mesmo que esteja marcada', () => {
    expect(telasPermitidas('telefonista', { telas: ['central', 'configuracoes', 'dashboard'] }).map((t) => t.id)).toEqual(['central']);
  });

  it('todas as telas dos níveis existem no catálogo (igual ao banco)', () => {
    const ids = TELAS.map((t) => t.id);
    for (const lista of Object.values(TELAS_DO_NIVEL)) for (const t of lista) expect(ids).toContain(t);
  });

  it('barra do celular tem no máximo 4 atalhos e repete os de antes', () => {
    expect(atalhosCelular(telasPermitidas('gestao', null))).toEqual(['central', 'painel', 'maqueiros', 'dashboard']);
    expect(atalhosCelular(telasPermitidas('telefonista', null))).toEqual(['central', 'painel', 'maqueiros', 'registros']);
    expect(atalhosCelular(telasPermitidas('gestao', diretoria))).toEqual(['dashboard', 'relatorios']);
  });
});

describe('escolha do perfil em Acessos', () => {
  it('perfil personalizado vira o papel do nível dele', () => {
    expect(resolverOpcaoPerfil('pa:p1', [diretoria])).toEqual({ papel: 'gestao', perfil_acesso_id: 'p1' });
    expect(resolverOpcaoPerfil('papel:telefonista', [diretoria])).toEqual({ papel: 'telefonista', perfil_acesso_id: null });
  });
  it('ida e volta do valor do select', () => {
    expect(valorOpcaoPerfil('gestao', 'p1')).toBe('pa:p1');
    expect(valorOpcaoPerfil('setor', null)).toBe('papel:setor');
  });
});
