-- Usado pelo pgbench em scripts/test-db-local.sh (abertura simultânea de chamados).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',true);
select (abrir_chamado('Exame',(select id from setores where nome='PS'),null,(select id from setores where nome='Tomografia'),null,null,'P')).numero;
commit;
