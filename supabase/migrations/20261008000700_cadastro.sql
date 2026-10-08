-- =====================================================================
-- Migration 7: autocadastro com aprovação da gestão
-- aprovado_em nulo + ativo = false  → cadastro aguardando aprovação
-- aprovado_em preenchido + ativo = false → acesso bloqueado pela gestão
-- O primeiro cadastro do sistema (nenhum perfil existente) vira gestão ativa.
-- =====================================================================
alter table public.perfis add column if not exists aprovado_em timestamptz null;
alter table public.perfis add column if not exists aprovado_por text null;
update public.perfis set aprovado_em = created_at where aprovado_em is null and ativo;
