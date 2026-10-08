-- =====================================================================
-- Migration 6: endurecimento apontado pelo Security Advisor do Supabase
-- 1) search_path fixo nas funções que ainda não tinham
-- 2) funções internas (usadas só dentro de outras funções security definer)
--    deixam de ser chamáveis diretamente pela API
-- =====================================================================
alter function public.agora_servidor() set search_path = public, pg_temp;
alter function public.grupo_motivo_atraso(text) set search_path = public, pg_temp;
alter function public.chamado_aberto_minutos(timestamptz, timestamptz) set search_path = public, pg_temp;

revoke execute on function public.exigir_papel(text[]) from authenticated;
revoke execute on function public.ator_atual() from authenticated;
revoke execute on function public.config_bool(text, boolean) from authenticated;
revoke execute on function public.escala_cadastrada(date) from authenticated;
revoke execute on function public.turnos_periodo(timestamptz, timestamptz) from authenticated;
