-- =====================================================================
-- Testes de RLS e regras de negócio (um usuário de cada papel).
-- Roda em transação e desfaz tudo no final (ROLLBACK).
--   Supabase:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_e_regras.sql
--   Local:     npm run test:db
-- Cada bloco lança exceção se a regra for violada; ao final imprime "TODOS OS TESTES PASSARAM".
-- =====================================================================
\set ON_ERROR_STOP 1
begin;

-- Helpers de teste --------------------------------------------------------
create or replace function pg_temp.como(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.headers', '{"x-ator-nome":"Ana%20Cl%C3%A1udia"}', true);
end $$;

create temp table ids (chave text primary key, id uuid);
grant all on ids to authenticated;

-- Usuários de teste
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'teste_gestao@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000a2', 'teste_telefonista@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000a3', 'teste_uti1@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000a4', 'teste_saojose@maqueiros.cssl'),
  ('00000000-0000-0000-0000-0000000000a5', 'teste_semperfil@maqueiros.cssl');

insert into public.perfis (id, usuario, papel, setor_id, nome) values
  ('00000000-0000-0000-0000-0000000000a1', 'teste_gestao', 'gestao', null, 'Gestão'),
  ('00000000-0000-0000-0000-0000000000a2', 'teste_telefonista', 'telefonista', null, 'Telefonista'),
  ('00000000-0000-0000-0000-0000000000a3', 'teste_uti1', 'setor', (select id from public.setores where nome = 'UTI 1'), 'UTI 1'),
  ('00000000-0000-0000-0000-0000000000a4', 'teste_saojose', 'setor', (select id from public.setores where nome = 'São José'), 'São José');

insert into ids values
  ('uti1', (select id from public.setores where nome = 'UTI 1')),
  ('saojose', (select id from public.setores where nome = 'São José')),
  ('tomo', (select id from public.setores where nome = 'Tomografia')),
  ('ps', (select id from public.setores where nome = 'PS')),
  ('necroterio', (select id from public.setores where nome = 'Necrotério'));

-- Maqueiro de teste com plantão de 24h via habilitação hoje e ontem (garante disponibilidade agora)
insert into public.maqueiros (id, nome, horario_inicio, horario_fim)
values ('00000000-0000-0000-0000-0000000000b1', 'MAQUEIRO TESTE', '00:00', '00:00');
insert into public.maqueiros (id, nome, horario_inicio, horario_fim)
values ('00000000-0000-0000-0000-0000000000b2', 'MAQUEIRO FORA', '07:00', '19:00');
-- escala do mês atual: apenas o MAQUEIRO TESTE com tipo E (00h-00h = 24h)
insert into public.escala_dias (maqueiro_id, data, tipo)
select '00000000-0000-0000-0000-0000000000b1', d::date, 'E'
from generate_series((now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date, interval '1 day') d;

set local role authenticated;

-- 1. Sem perfil: não vê nada --------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000a5');
do $$ begin
  if (select count(*) from public.setores) <> 0 then raise exception 'FALHA: usuário sem perfil enxerga setores'; end if;
  if (select count(*) from public.chamados) <> 0 then raise exception 'FALHA: usuário sem perfil enxerga chamados'; end if;
  begin
    perform public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Paciente X');
    raise exception 'FALHA: usuário sem perfil abriu chamado';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. Telefonista abre chamados; número sequencial; hora do servidor ------
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
do $$
declare c public.chamados; c2 public.chamados;
begin
  c := public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Paciente PS');
  if c.numero !~ '^CH-\d{4}-\d{6}$' then raise exception 'FALHA: formato do número %', c.numero; end if;
  if c.status <> 'aguardando_maqueiro' then raise exception 'FALHA: status inicial'; end if;
  if c.criado_por <> 'Ana Cláudia (teste_telefonista)' then raise exception 'FALHA: criado_por = %', c.criado_por; end if;
  c2 := public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Paciente PS 2');
  if c2.numero = c.numero or substr(c2.numero, 9)::int <> substr(c.numero, 9)::int + 1 then
    raise exception 'FALHA: numeração não sequencial % / %', c.numero, c2.numero;
  end if;
  insert into ids values ('ch_ps', c.id), ('ch_ps2', c2.id);

  -- telefonista não pode informar hora de abertura
  begin
    perform public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'X',
      p_aberto_em => now() - interval '1 hour', p_justificativa_hora => 'teste');
    raise exception 'FALHA: telefonista informou hora de abertura';
  exception when insufficient_privilege then null;
  end;

  -- Alta: sem destino
  c := public.abrir_chamado('Alta', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Alta X');
  if c.setor_destino_id is not null then raise exception 'FALHA: Alta gravou destino'; end if;

  -- Óbito: destino Necrotério
  c := public.abrir_chamado('Óbito', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Óbito X');
  if c.setor_destino_id <> (select id from ids where chave = 'necroterio') then raise exception 'FALHA: Óbito sem Necrotério'; end if;

  -- Transferência interna exige leitos
  begin
    perform public.abrir_chamado('Transferência interna', (select id from ids where chave = 'ps'), '10', (select id from ids where chave = 'tomo'), null, null, 'T');
    raise exception 'FALHA: transferência sem leito de destino aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Setor com exige_leito: leito de origem obrigatório para qualquer tipo
  begin
    perform public.abrir_chamado('Exame', (select id from ids where chave = 'uti1'), null, (select id from ids where chave = 'tomo'), null, null, 'U');
    raise exception 'FALHA: UTI 1 sem leito aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Destino obrigatório (exceto Alta/Óbito)
  begin
    perform public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, null, null, null, 'U');
    raise exception 'FALHA: exame sem destino aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Escrita direta proibida
  begin
    update public.chamados set status = 'concluido' where id = (select id from ids where chave = 'ch_ps');
    raise exception 'FALHA: UPDATE direto permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.chamados where id = (select id from ids where chave = 'ch_ps');
    raise exception 'FALHA: DELETE direto permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chamados (numero, tipo, setor_origem_id) values ('CH-0000-000001', 'Exame', (select id from ids where chave = 'ps'));
    raise exception 'FALHA: INSERT direto permitido';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Disponibilidade e acionamento -------------------------------------
do $$
declare c public.chamados;
begin
  if not public.maqueiro_disponivel('00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FALHA: maqueiro escalado (E 24h) não aparece disponível';
  end if;
  if public.maqueiro_disponivel('00000000-0000-0000-0000-0000000000b2') then
    raise exception 'FALHA: maqueiro sem escala no mês aparece disponível';
  end if;
  -- maqueiro fora da escala não pode ser acionado
  begin
    perform public.acionar_maqueiro((select id from ids where chave = 'ch_ps'), '00000000-0000-0000-0000-0000000000b2');
    raise exception 'FALHA: acionou maqueiro fora da escala';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  -- habilitar (troca de plantão) 24h → pode ser acionado
  perform public.habilitar_maqueiro('00000000-0000-0000-0000-0000000000b2', '00:00', '00:00', 'Cobertura', 'Cobre o colega');
  if not public.maqueiro_disponivel('00000000-0000-0000-0000-0000000000b2') then
    raise exception 'FALHA: habilitação não tornou o maqueiro disponível';
  end if;

  c := public.acionar_maqueiro((select id from ids where chave = 'ch_ps'), '00000000-0000-0000-0000-0000000000b1');
  if c.status <> 'maqueiro_acionado' or c.maqueiro_informado_em is null then raise exception 'FALHA: acionamento'; end if;

  -- indisponível sai da lista
  perform public.marcar_indisponivel('00000000-0000-0000-0000-0000000000b2', 'Atestado', 'Atestado médico');
  if public.maqueiro_disponivel('00000000-0000-0000-0000-0000000000b2') then
    raise exception 'FALHA: maqueiro indisponível aparece disponível';
  end if;
  begin
    perform public.marcar_indisponivel('00000000-0000-0000-0000-0000000000b1', 'Falta', '');
    raise exception 'FALHA: indisponibilidade sem justificativa aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  perform public.disponibilizar_maqueiro('00000000-0000-0000-0000-0000000000b2');
  if not public.maqueiro_disponivel('00000000-0000-0000-0000-0000000000b2') then
    raise exception 'FALHA: disponibilizar não funcionou';
  end if;

  -- intervalo
  perform public.definir_intervalo('00000000-0000-0000-0000-0000000000b2', true);
  if public.maqueiro_disponivel('00000000-0000-0000-0000-0000000000b2') then raise exception 'FALHA: intervalo'; end if;
  if (select count(*) from public.intervalos where maqueiro_id = '00000000-0000-0000-0000-0000000000b2' and fim is null) <> 1 then
    raise exception 'FALHA: intervalo não registrado';
  end if;
  if (select intervalo_inicio from public.painel_maqueiros() where maqueiro_id = '00000000-0000-0000-0000-0000000000b2') is null then
    raise exception 'FALHA: painel sem início do intervalo';
  end if;
  begin
    perform public.definir_intervalo('00000000-0000-0000-0000-0000000000b2', true);
    raise exception 'FALHA: dois intervalos abertos';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  perform public.definir_intervalo('00000000-0000-0000-0000-0000000000b2', false);
  if exists (select 1 from public.intervalos where maqueiro_id = '00000000-0000-0000-0000-0000000000b2' and fim is null) then
    raise exception 'FALHA: intervalo não encerrado';
  end if;
  if (select count(*) from public.vw_intervalos where maqueiro_id = '00000000-0000-0000-0000-0000000000b2' and not em_andamento) <> 1 then
    raise exception 'FALHA: view de intervalos';
  end if;
  begin
    perform public.definir_intervalo((select id from public.maqueiros where nome = 'VANEIR FELIPE'), true);
    raise exception 'FALHA: intervalo para maqueiro fora da escala';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    insert into public.intervalos (maqueiro_id) values ('00000000-0000-0000-0000-0000000000b2');
    raise exception 'FALHA: INSERT direto em intervalos';
  exception when insufficient_privilege then null;
  end;

  -- painel lista todos os ativos
  if (select count(*) from public.painel_maqueiros() where maqueiro_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2')) <> 2 then
    raise exception 'FALHA: painel dos maqueiros';
  end if;
  if (select situacao from public.painel_maqueiros() where maqueiro_id = '00000000-0000-0000-0000-0000000000b1') <> 'maqueiro_acionado' then
    raise exception 'FALHA: situação do maqueiro acionado';
  end if;
  -- maqueiros do seed sem escala no mês ficam fora da escala
  if exists (select 1 from public.painel_maqueiros() where nome = 'VANEIR FELIPE' and situacao <> 'fora_escala') then
    raise exception 'FALHA: maqueiro sem plantão não aparece fora da escala';
  end if;

  -- status intermediário e encerramento
  c := public.mudar_status((select id from ids where chave = 'ch_ps'), 'em_atendimento');
  if c.inicio_atendimento_em is null then raise exception 'FALHA: início do atendimento não gravado'; end if;
  begin
    perform public.mudar_status((select id from ids where chave = 'ch_ps'), 'concluido');
    raise exception 'FALHA: mudar_status para concluido aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  c := public.encerrar_chamado((select id from ids where chave = 'ch_ps'));
  if c.status <> 'concluido' or c.encerrado_em is null or c.encerrado_por is null then raise exception 'FALHA: encerramento'; end if;

  -- auditoria gerada
  if (select count(*) from public.chamado_eventos where chamado_id = c.id) < 4 then
    raise exception 'FALHA: auditoria incompleta';
  end if;
end $$;

-- 4. Atraso: encerrar após SLA exige motivo -------------------------------
reset role;
-- simula chamado aberto há 45 min (ajuste feito como superusuário só para o teste)
update public.chamados set aberto_em = now() - interval '45 minutes' where id = (select id from ids where chave = 'ch_ps2');
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
do $$
declare c public.chamados;
begin
  perform public.acionar_maqueiro((select id from ids where chave = 'ch_ps2'), '00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.encerrar_chamado((select id from ids where chave = 'ch_ps2'));
    raise exception 'FALHA: encerrou atrasado sem motivo';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    perform public.encerrar_chamado((select id from ids where chave = 'ch_ps2'), 'Outro', null);
    raise exception 'FALHA: motivo Outro sem descrição aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  c := public.encerrar_chamado((select id from ids where chave = 'ch_ps2'), 'Elevador indisponível');
  if c.motivo_atraso <> 'Elevador indisponível' then raise exception 'FALHA: motivo não gravado'; end if;
  if not (select atrasado from public.vw_chamados_metricas where id = c.id) then raise exception 'FALHA: view não marca atraso'; end if;

  -- telefonista não corrige horário
  begin
    perform public.corrigir_chamado(c.id, 'aberto_em', (now() - interval '30 minutes')::text, 'teste');
    raise exception 'FALHA: telefonista corrigiu horário';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 5. Setores: isolamento total --------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000a3'); -- UTI 1
do $$
declare c public.chamados;
begin
  -- setor de origem é forçado para o próprio setor (mesmo tentando São José)
  c := public.abrir_chamado('Exame', (select id from ids where chave = 'saojose'), '5', (select id from ids where chave = 'tomo'),
                            null, null, 'Paciente UTI', 'Telefone/central', 'Enf. Joana');
  if c.setor_origem_id <> (select id from ids where chave = 'uti1') then raise exception 'FALHA: setor não forçado'; end if;
  if c.origem_chamado <> 'Setor (enfermagem)' then raise exception 'FALHA: origem do chamado do setor'; end if;
  insert into ids values ('ch_uti1', c.id);

  begin
    perform public.abrir_chamado('Exame', null, '5', (select id from ids where chave = 'tomo'), null, null, 'Paciente UTI');
    raise exception 'FALHA: setor abriu sem solicitante';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- setor não aciona maqueiro nem encerra
  begin
    perform public.acionar_maqueiro(c.id, '00000000-0000-0000-0000-0000000000b1');
    raise exception 'FALHA: setor acionou maqueiro';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.encerrar_chamado(c.id);
    raise exception 'FALHA: setor encerrou chamado';
  exception when insufficient_privilege then null;
  end;

  -- só enxerga os próprios
  if exists (select 1 from public.chamados where setor_origem_id <> (select id from ids where chave = 'uti1')) then
    raise exception 'FALHA: setor enxerga chamado de outro setor';
  end if;
  if exists (select 1 from public.vw_chamados_metricas where setor_origem_id <> (select id from ids where chave = 'uti1')) then
    raise exception 'FALHA: setor enxerga outro setor pela view';
  end if;
  if exists (select 1 from public.chamado_eventos e where e.chamado_id is null or e.chamado_id <> c.id) then
    raise exception 'FALHA: setor enxerga histórico alheio';
  end if;
  if exists (select 1 from public.intervalos) then
    raise exception 'FALHA: setor enxerga intervalos';
  end if;
  -- não escreve cadastros
  begin
    update public.maqueiros set nome = 'X';
    if found then raise exception 'FALHA: setor alterou maqueiro'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.habilitar_maqueiro('00000000-0000-0000-0000-0000000000b2');
    raise exception 'FALHA: setor habilitou maqueiro';
  exception when insufficient_privilege then null;
  end;
end $$;

select pg_temp.como('00000000-0000-0000-0000-0000000000a4'); -- São José
do $$
begin
  if exists (select 1 from public.chamados where id = (select id from ids where chave = 'ch_uti1')) then
    raise exception 'FALHA: São José enxerga chamado da UTI 1';
  end if;
  begin
    perform public.cancelar_chamado((select id from ids where chave = 'ch_uti1'), 'tentativa indevida');
    raise exception 'FALHA: São José cancelou chamado da UTI 1';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

select pg_temp.como('00000000-0000-0000-0000-0000000000a3'); -- UTI 1 cancela o próprio
do $$
declare c public.chamados;
begin
  begin
    perform public.cancelar_chamado((select id from ids where chave = 'ch_uti1'), '');
    raise exception 'FALHA: cancelamento sem justificativa';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  c := public.cancelar_chamado((select id from ids where chave = 'ch_uti1'), 'Paciente não estava pronto');
  if c.status <> 'cancelado' or c.cancelado_por is null then raise exception 'FALHA: cancelamento do setor'; end if;
  begin
    perform public.cancelar_chamado(c.id, 'de novo');
    raise exception 'FALHA: cancelou duas vezes';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

-- 6. Gestão: corrige com justificativa; ninguém exclui ---------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
do $$
declare c public.chamados; v_antes int;
begin
  c := public.abrir_chamado('Exame', (select id from ids where chave = 'ps'), null, (select id from ids where chave = 'tomo'), null, null, 'Retroativo',
      p_aberto_em => now() - interval '2 hours', p_justificativa_hora => 'Registro do livro');
  if c.aberto_em > now() - interval '119 minutes' then raise exception 'FALHA: gestão não registrou hora retroativa'; end if;

  begin
    perform public.corrigir_chamado(c.id, 'aberto_em', (now() - interval '3 hours')::text, '');
    raise exception 'FALHA: correção sem justificativa';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  select count(*) into v_antes from public.chamado_eventos where chamado_id = c.id;
  perform public.corrigir_chamado(c.id, 'aberto_em', (now() - interval '3 hours')::text, 'Hora conferida no livro');
  if not exists (select 1 from public.chamado_eventos where chamado_id = c.id and acao = 'correcao'
                 and campo = 'aberto_em' and justificativa = 'Hora conferida no livro' and valor_antigo is not null) then
    raise exception 'FALHA: correção sem rastro';
  end if;

  -- gestão vê todos os setores
  if not exists (select 1 from public.chamados where id = (select id from ids where chave = 'ch_uti1')) then
    raise exception 'FALHA: gestão não vê chamado do setor';
  end if;

  -- histórico imutável; exclusão impossível
  begin
    delete from public.chamado_eventos;
    raise exception 'FALHA: gestão apagou histórico';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.chamados;
    raise exception 'FALHA: gestão apagou chamado';
  exception when insufficient_privilege then null;
  end;

  -- gestão edita cadastro e gera auditoria
  update public.maqueiros set horario_fim = '20:00' where id = '00000000-0000-0000-0000-0000000000b2';
  if not exists (select 1 from public.chamado_eventos where entidade = 'maqueiros' and entidade_id = '00000000-0000-0000-0000-0000000000b2' and campo = 'horario_fim') then
    raise exception 'FALHA: alteração de maqueiro sem auditoria';
  end if;

  -- capacidade do dia retorna 24 horas
  if (select count(*) from public.capacidade_dia((now() at time zone 'America/Fortaleza')::date)) <> 24 then
    raise exception 'FALHA: capacidade_dia';
  end if;
end $$;

-- 7. Mesmo o superusuário/service_role não consegue excluir chamado ---------
reset role;
do $$ begin
  begin
    delete from public.chamados where id = (select id from ids where chave = 'ch_ps');
    raise exception 'FALHA: exclusão de chamado como superusuário';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

-- 8. Plantão noturno atravessando a meia-noite ------------------------------
do $$
declare
  v_dia date := date '2030-01-15';
  v_id uuid := '00000000-0000-0000-0000-0000000000b3';
begin
  insert into public.maqueiros (id, nome, turno, horario_inicio, horario_fim) values (v_id, 'NOTURNO TESTE', 'Noturno', '19:00', '07:00');
  insert into public.escala_dias (maqueiro_id, data, tipo) values (v_id, v_dia, 'N');
  if not public.maqueiro_em_plantao(v_id, ((v_dia + time '23:30') at time zone 'America/Fortaleza')) then raise exception 'FALHA: N às 23h30'; end if;
  if not public.maqueiro_em_plantao(v_id, ((v_dia + 1 + time '06:30') at time zone 'America/Fortaleza')) then raise exception 'FALHA: N às 06h30 do dia seguinte'; end if;
  if public.maqueiro_em_plantao(v_id, ((v_dia + 1 + time '07:30') at time zone 'America/Fortaleza')) then raise exception 'FALHA: N após 07h'; end if;
  if public.maqueiro_em_plantao(v_id, ((v_dia + time '18:30') at time zone 'America/Fortaleza')) then raise exception 'FALHA: N antes das 19h'; end if;
  -- maqueiro diurno com N na escala usa 19h-07h
  update public.escala_dias set tipo = 'D' where maqueiro_id = v_id and data = v_dia;
  if not public.maqueiro_em_plantao(v_id, ((v_dia + time '10:00') at time zone 'America/Fortaleza')) then raise exception 'FALHA: noturno com D usa 07-19'; end if;
  -- férias
  update public.escala_dias set tipo = 'F' where maqueiro_id = v_id and data = v_dia;
  if public.maqueiro_em_plantao(v_id, ((v_dia + time '23:00') at time zone 'America/Fortaleza')) then raise exception 'FALHA: férias em plantão'; end if;
  -- mês sem escala: fallback pelo horário padrão
  if not public.maqueiro_em_plantao(v_id, ((date '2031-03-10' + time '23:00') at time zone 'America/Fortaleza')) then raise exception 'FALHA: fallback sem escala'; end if;
  if public.maqueiro_em_plantao(v_id, ((date '2031-03-10' + time '12:00') at time zone 'America/Fortaleza')) then raise exception 'FALHA: fallback fora do horário'; end if;
end $$;

-- 9. Número nunca repete (unique + sequência travada) ----------------------
do $$ begin
  if exists (select numero from public.chamados group by numero having count(*) > 1) then
    raise exception 'FALHA: número repetido';
  end if;
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;
rollback;
