-- =====================================================================
-- Testes do app do maqueiro e do despacho automático.
-- Roda em transação e desfaz tudo (ROLLBACK). Mesmo uso de rls_e_regras.sql.
-- =====================================================================
\set ON_ERROR_STOP 1
begin;

create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $$;
create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;

-- hospital fictício para o teste e feriados vazios
update public.configuracoes set valor = '[]' where chave = 'feriados';
insert into public.configuracoes (chave, valor) values ('hospital_lat', '-5.8'), ('hospital_lng', '-35.2'), ('hospital_raio_m', '300'),
  ('despacho_automatico', 'true'), ('oferta_timeout_s', '90')
on conflict (chave) do update set valor = excluded.valor;

-- maqueiros de teste com plantão 24h (escala E hoje e ontem); M3 é do CC
insert into public.maqueiros (id, nome, horario_inicio, horario_fim, setor_atuacao) values
  ('00000000-0000-0000-0000-0000000000d1', 'APP UM', '00:00', '00:00', 'Hospital'),
  ('00000000-0000-0000-0000-0000000000d2', 'APP DOIS', '00:00', '00:00', 'Hospital'),
  ('00000000-0000-0000-0000-0000000000d3', 'APP TRES CC', '00:00', '00:00', 'CC'),
  ('00000000-0000-0000-0000-0000000000d4', 'APP FORA', '07:00', '19:00', 'Hospital');
insert into public.escala_dias (maqueiro_id, data, tipo)
select m, d::date, 'E'
from unnest(array['00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3']::uuid[]) m,
     generate_series((now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date, interval '1 day') d;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e0', 'app_tel@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000e1', 'app_um@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000e2', 'app_dois@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000e3', 'app_tres@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000e4', 'app_fora@maqueiros.cssl');
insert into public.perfis (id, usuario, papel, nome, maqueiro_id) values
  ('00000000-0000-0000-0000-0000000000e0', 'app_tel', 'telefonista', 'Central', null),
  ('00000000-0000-0000-0000-0000000000e1', 'app_um', 'maqueiro', 'Um', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', 'app_dois', 'maqueiro', 'Dois', '00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000e3', 'app_tres', 'maqueiro', 'Tres', '00000000-0000-0000-0000-0000000000d3'),
  ('00000000-0000-0000-0000-0000000000e4', 'app_fora', 'maqueiro', 'Fora', '00000000-0000-0000-0000-0000000000d4');
insert into ids values
  ('ps', (select id from public.setores where nome = 'PS')),
  ('tomo', (select id from public.setores where nome = 'Tomografia')),
  ('cc', (select id from public.setores where nome = 'Centro Cirúrgico'));

set local role authenticated;

-- 1. Jornada: fora da escala, longe do hospital, dentro do hospital ------------
do $$ begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e4');
  begin
    perform public.iniciar_jornada(-5.8, -35.2, 10);
    raise exception 'FALHA: jornada fora da escala';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;

  perform pg_temp.como('00000000-0000-0000-0000-0000000000e1');
  begin
    perform public.iniciar_jornada(-5.83, -35.2, 10); -- ~3 km
    raise exception 'FALHA: jornada longe do hospital';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  perform public.iniciar_jornada(-5.8005, -35.2, 15);
  begin
    perform public.iniciar_jornada(-5.8, -35.2, 10);
    raise exception 'FALHA: duas jornadas';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;

  perform pg_temp.como('00000000-0000-0000-0000-0000000000e2');
  perform public.iniciar_jornada(-5.8, -35.2, 10);
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e3');
  perform public.iniciar_jornada(-5.8, -35.2, 10);
end $$;

-- fila: DOIS livre há mais tempo, depois UM, depois TRÊS
reset role;
update public.jornadas set inicio = now() - interval '3 hours' where maqueiro_id = '00000000-0000-0000-0000-0000000000d2';
update public.jornadas set inicio = now() - interval '2 hours' where maqueiro_id = '00000000-0000-0000-0000-0000000000d1';
update public.jornadas set inicio = now() - interval '1 hours' where maqueiro_id = '00000000-0000-0000-0000-0000000000d3';
set local role authenticated;

-- 2. Chamado comum vai para quem está livre há mais tempo -----------------------
do $$
declare c public.chamados; v jsonb;
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  c := public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Maria José da Silva');
  insert into ids values ('c1', c.id);
  if (select maqueiro_id from public.ofertas where chamado_id = c.id and status = 'pendente') <> '00000000-0000-0000-0000-0000000000d2' then
    raise exception 'FALHA: oferta não foi para o livre há mais tempo';
  end if;
  if (select count(*) from public.ofertas where chamado_id = c.id) <> 1 then raise exception 'FALHA: rotina ofertada a mais de um'; end if;
  if (select expira_em - enviada_em from public.ofertas where chamado_id = c.id) <> interval '90 seconds' then
    raise exception 'FALHA: tempo da oferta diferente de 90 s';
  end if;

  -- o maqueiro vê a oferta pelo app, com paciente mascarado, e não acessa a tabela de chamados
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e2');
  v := public.app_maqueiro_estado();
  if jsonb_array_length(v -> 'ofertas') <> 1 then raise exception 'FALHA: app não mostra a oferta'; end if;
  if v #>> '{ofertas,0,chamado,paciente}' <> 'M. J. S.' then
    raise exception 'FALHA: paciente não mascarado (%)', v #>> '{ofertas,0,chamado,paciente}';
  end if;
  if exists (select 1 from public.chamados) then raise exception 'FALHA: maqueiro lê a tabela de chamados'; end if;
  if exists (select 1 from public.vw_chamados_metricas) then raise exception 'FALHA: maqueiro lê a view de chamados'; end if;
  if exists (select 1 from public.ofertas where maqueiro_id <> '00000000-0000-0000-0000-0000000000d2') then
    raise exception 'FALHA: maqueiro vê oferta de outro';
  end if;

  -- recusa exige justificativa e passa para o próximo (UM)
  begin
    perform public.recusar_oferta((select id from public.ofertas where chamado_id = c.id and status = 'pendente'), '');
    raise exception 'FALHA: recusa sem justificativa';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  perform public.recusar_oferta((select id from public.ofertas where maqueiro_id = '00000000-0000-0000-0000-0000000000d2' and status = 'pendente'), 'Banheiro');

  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  if (select maqueiro_id from public.ofertas where chamado_id = c.id and status = 'pendente') <> '00000000-0000-0000-0000-0000000000d1' then
    raise exception 'FALHA: após recusa não passou ao próximo da fila';
  end if;
end $$;

-- 3. Tempo esgotado passa adiante; maqueiro do CC só em dia especial -----------------
reset role;
update public.ofertas set expira_em = now() - interval '1 second'
 where chamado_id = (select id from ids where chave = 'c1') and status = 'pendente';
set local role authenticated;
do $$
declare v_especial boolean := public.eh_dia_especial((now() at time zone 'America/Fortaleza')::date);
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  perform public.processar_despacho();
  if (select status from public.ofertas where chamado_id = (select id from ids where chave = 'c1') and maqueiro_id = '00000000-0000-0000-0000-0000000000d1') <> 'expirada' then
    raise exception 'FALHA: oferta não expirou';
  end if;
  if not v_especial then
    if exists (select 1 from public.ofertas where chamado_id = (select id from ids where chave = 'c1') and status = 'pendente') then
      raise exception 'FALHA: maqueiro do CC recebeu chamado do hospital em dia útil';
    end if;
    if (select despacho_esgotado_em from public.chamados where id = (select id from ids where chave = 'c1')) is null then
      raise exception 'FALHA: chamado sem aceite não foi sinalizado para a Central';
    end if;
  end if;
end $$;

-- marca hoje como feriado: o CC passa a receber do hospital
reset role;
update public.configuracoes set valor = jsonb_build_array(to_char((now() at time zone 'America/Fortaleza')::date, 'YYYY-MM-DD'))
 where chave = 'feriados';
set local role authenticated;
do $$
declare c public.chamados;
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  perform public.processar_despacho();
  if (select maqueiro_id from public.ofertas where chamado_id = (select id from ids where chave = 'c1') and status = 'pendente') <> '00000000-0000-0000-0000-0000000000d3' then
    raise exception 'FALHA: em feriado o maqueiro do CC não recebeu';
  end if;
  if (select despacho_esgotado_em from public.chamados where id = (select id from ids where chave = 'c1')) is not null then
    raise exception 'FALHA: sinal de esgotado não foi limpo';
  end if;

  -- 4. Aceite pelo app: chamado vai para o maqueiro --------------------------------
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e1');
  begin
    perform public.aceitar_oferta((select id from public.ofertas where chamado_id = (select id from ids where chave = 'c1') and status = 'pendente'));
    raise exception 'FALHA: maqueiro aceitou oferta de outro';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;

  perform pg_temp.como('00000000-0000-0000-0000-0000000000e3');
  c := public.aceitar_oferta((select id from public.ofertas where maqueiro_id = '00000000-0000-0000-0000-0000000000d3' and status = 'pendente'));
  if c.maqueiro_id <> '00000000-0000-0000-0000-0000000000d3' or c.status <> 'maqueiro_acionado' or c.maqueiro_informado_em is null then
    raise exception 'FALHA: aceite não acionou o maqueiro';
  end if;
  if (public.app_maqueiro_estado() -> 'chamado_ativo' ->> 'numero') <> c.numero then raise exception 'FALHA: chamado ativo no app'; end if;
  begin
    perform public.encerrar_jornada();
    raise exception 'FALHA: encerrou jornada com chamado em andamento';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    perform public.definir_intervalo('00000000-0000-0000-0000-0000000000d3', true);
    raise exception 'FALHA: intervalo com chamado em andamento';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;

  c := public.mudar_status(c.id, 'em_atendimento');
  if c.inicio_atendimento_em is null then raise exception 'FALHA: início do atendimento pelo app'; end if;
  c := public.encerrar_chamado(c.id);
  if c.status <> 'concluido' then raise exception 'FALHA: conclusão pelo app'; end if;

  -- outro maqueiro não mexe em chamado que não é dele; maqueiro não abre nem aciona
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e1');
  begin
    perform public.mudar_status(c.id, 'aguardando_maca');
    raise exception 'FALHA: maqueiro alterou chamado de outro';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    perform public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'X');
    raise exception 'FALHA: maqueiro abriu chamado';
  exception when insufficient_privilege then null; end;
  begin
    perform public.acionar_maqueiro(c.id, '00000000-0000-0000-0000-0000000000d1');
    raise exception 'FALHA: maqueiro acionou pela Central';
  exception when insufficient_privilege then null; end;
end $$;

-- 5. Urgente: oferecido a todos os livres; o primeiro que aceita leva ---------------
do $$
declare c public.chamados;
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  c := public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Urgente X',
                            p_prioridade => 'Urgente');
  insert into ids values ('c2', c.id);
  if (select count(*) from public.ofertas where chamado_id = c.id and status = 'pendente') <> 3 then
    raise exception 'FALHA: urgente não foi para todos os livres (%)', (select count(*) from public.ofertas where chamado_id = c.id);
  end if;
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e1');
  perform public.aceitar_oferta((select id from public.ofertas where chamado_id = (select id from ids where chave = 'c2') and maqueiro_id = '00000000-0000-0000-0000-0000000000d1'));
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e2');
  if jsonb_array_length(public.app_maqueiro_estado() -> 'ofertas') <> 0 then raise exception 'FALHA: oferta urgente não foi retirada dos outros'; end if;
  begin
    perform public.aceitar_oferta((select id from public.ofertas where chamado_id = (select id from ids where chave = 'c2') and maqueiro_id = '00000000-0000-0000-0000-0000000000d2'));
    raise exception 'FALHA: dois maqueiros aceitaram o mesmo urgente';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- 6. Chamado do CC em dia útil vai primeiro para o maqueiro do CC --------------------
reset role;
update public.configuracoes set valor = '[]' where chave = 'feriados';
set local role authenticated;
do $$
declare c public.chamados;
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  c := public.abrir_chamado('Centro Cirúrgico', (select id from ids where chave = 'cc'), null, (select id from ids where chave = 'tomo'), null, null, 'CC X');
  if (select maqueiro_id from public.ofertas where chamado_id = c.id and status = 'pendente') <> '00000000-0000-0000-0000-0000000000d3' then
    raise exception 'FALHA: chamado do CC não foi primeiro para o maqueiro do CC';
  end if;

  -- intervalo do próprio maqueiro retira a oferta e repassa
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e3');
  perform public.definir_intervalo('00000000-0000-0000-0000-0000000000d3', true);
  begin
    perform public.definir_intervalo('00000000-0000-0000-0000-0000000000d2', true);
    raise exception 'FALHA: maqueiro marcou intervalo de outro';
  exception when insufficient_privilege then null; end;
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  if (select maqueiro_id from public.ofertas where chamado_id = c.id and status = 'pendente') <> '00000000-0000-0000-0000-0000000000d2' then
    raise exception 'FALHA: oferta não foi repassada quando o maqueiro entrou em intervalo';
  end if;

  -- Central atribui manualmente: oferta pendente é cancelada
  perform public.acionar_maqueiro(c.id, '00000000-0000-0000-0000-0000000000d2');
  if exists (select 1 from public.ofertas where chamado_id = c.id and status = 'pendente') then
    raise exception 'FALHA: oferta continuou pendente após acionamento manual';
  end if;

  -- Central pode encerrar jornada esquecida
  perform public.encerrar_jornada('00000000-0000-0000-0000-0000000000d3');
  if exists (select 1 from public.jornadas where maqueiro_id = '00000000-0000-0000-0000-0000000000d3' and fim is null) then
    raise exception 'FALHA: Central não encerrou a jornada';
  end if;
  if exists (select 1 from public.intervalos where maqueiro_id = '00000000-0000-0000-0000-0000000000d3' and fim is null) then
    raise exception 'FALHA: intervalo ficou aberto ao encerrar a jornada';
  end if;
  if (select count(*) from public.vw_ofertas) < 5 or (select count(*) from public.vw_jornadas) < 3 then
    raise exception 'FALHA: views de ofertas/jornadas';
  end if;
end $$;

-- 7. Despacho desligado: nada é oferecido ------------------------------------------
reset role;
update public.configuracoes set valor = 'false' where chave = 'despacho_automatico';
set local role authenticated;
do $$
declare c public.chamados;
begin
  perform pg_temp.como('00000000-0000-0000-0000-0000000000e0');
  c := public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Manual');
  if exists (select 1 from public.ofertas where chamado_id = c.id) then raise exception 'FALHA: ofertou com despacho desligado'; end if;
end $$;

select 'DESPACHO E APP: TODOS OS TESTES PASSARAM' as resultado;
rollback;
