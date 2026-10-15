import type { NomeIcone } from '@/components/Icone';
import type { PerfilAcesso } from '@/types/database';

export type Papel = 'gestao' | 'telefonista' | 'setor' | 'maqueiro';
export type NivelPerfil = 'gestao' | 'telefonista' | 'setor' | 'maqueiro';

export type Tela = { id: string; rotulo: string; icone: NomeIcone; descricao: string };

/** Todas as telas do sistema, na ordem do menu. O id é também o caminho (/central, /painel…). */
export const TELAS: Tela[] = [
  { id: 'central', rotulo: 'Central', icone: 'central', descricao: 'Abrir chamados, informar maqueiro e encerrar' },
  { id: 'painel', rotulo: 'Painel', icone: 'painel', descricao: 'Painel de acompanhamento (telão)' },
  { id: 'maqueiros', rotulo: 'Maqueiros', icone: 'maqueiros', descricao: 'Habilitar, indisponibilizar e intervalo' },
  { id: 'registros', rotulo: 'Registros', icone: 'registros', descricao: 'Consulta de horários e tempos dos chamados' },
  { id: 'meus-chamados', rotulo: 'Meus chamados', icone: 'chamados', descricao: 'Abrir e acompanhar os chamados do setor' },
  { id: 'dashboard', rotulo: 'Dashboard', icone: 'dashboard', descricao: 'Indicadores, intervalos e app' },
  { id: 'capacidade', rotulo: 'Capacidade', icone: 'capacidade', descricao: 'Capacidade x demanda por hora' },
  { id: 'relatorios', rotulo: 'Relatórios', icone: 'relatorios', descricao: 'Relatórios diário e mensal com exportação' },
  { id: 'escala', rotulo: 'Escala', icone: 'escala', descricao: 'Escala mensal dos maqueiros' },
  { id: 'historico', rotulo: 'Histórico', icone: 'historico', descricao: 'Auditoria de todas as alterações' },
  { id: 'configuracoes', rotulo: 'Configurações', icone: 'configuracoes', descricao: 'Parâmetros, setores, perfis e acessos' },
  { id: 'app', rotulo: 'App do maqueiro', icone: 'maqueiros', descricao: 'Receber, aceitar e concluir chamados no celular' },
];

/** Telas que cada nível de permissão pode usar (igual à função telas_do_papel do banco). */
export const TELAS_DO_NIVEL: Record<Papel, string[]> = {
  gestao: ['central', 'painel', 'maqueiros', 'registros', 'dashboard', 'capacidade', 'relatorios', 'escala', 'historico', 'configuracoes'],
  telefonista: ['central', 'painel', 'maqueiros', 'registros'],
  setor: ['meus-chamados'],
  maqueiro: ['app'],
};

/** Atalhos da barra de baixo do celular (no máximo 4), em ordem de preferência. */
const PRIORIDADE_CELULAR = ['central', 'meus-chamados', 'painel', 'maqueiros', 'dashboard', 'registros', 'relatorios', 'escala', 'capacidade', 'historico', 'configuracoes'];

export const NOME_NIVEL: Record<NivelPerfil, string> = {
  gestao: 'Gestão NIR (acesso completo)',
  telefonista: 'Central de telefonistas',
  setor: 'Enfermagem do setor',
  maqueiro: 'Maqueiro (app do celular)',
};

/** Perfis que já vêm no sistema e não podem ser editados. */
export const PERFIS_PADRAO: { papel: Papel; nome: string; descricao: string }[] = [
  { papel: 'gestao', nome: 'Gestão NIR', descricao: 'Acesso a tudo, inclusive Configurações e Acessos.' },
  { papel: 'telefonista', nome: 'Central (telefonista)', descricao: 'Chamados, Painel, Maqueiros e Registros.' },
  { papel: 'setor', nome: 'Enfermagem', descricao: 'Abre e acompanha os chamados do próprio setor.' },
  { papel: 'maqueiro', nome: 'Maqueiro', descricao: 'Só o app do celular: recebe, aceita e conclui chamados.' },
];

/** Telas liberadas para o usuário: as do nível, filtradas pelo perfil personalizado (se houver). */
export function telasPermitidas(papel: Papel, perfilAcesso: Pick<PerfilAcesso, 'telas'> | null): Tela[] {
  const doNivel = TELAS_DO_NIVEL[papel] ?? [];
  const ids = perfilAcesso ? doNivel.filter((t) => perfilAcesso.telas.includes(t)) : doNivel;
  return TELAS.filter((t) => ids.includes(t.id));
}

export function atalhosCelular(telas: Tela[]): string[] {
  return PRIORIDADE_CELULAR.filter((id) => telas.some((t) => t.id === id)).slice(0, 4);
}
