-- =====================================================================
-- Dados iniciais · Casa de Saúde São Lucas
-- Usuários NÃO são criados aqui: use scripts/criar-usuarios.mjs (service_role).
-- A escala mensal deve ser importada da planilha oficial pela tela Escala.
-- (Exemplo opcional de escala: supabase/seed_escala_exemplo_out2026.sql)
-- =====================================================================

insert into public.setores (nome, exige_leito, ordem) values
  ('PS', false, 1),
  ('Centro Cirúrgico', false, 2),
  ('Hemodinâmica', false, 3),
  ('Ressonância', false, 4),
  ('Tomografia', false, 5),
  ('Ultrassonografia', false, 6),
  ('Ecocardiograma', false, 7),
  ('Endoscopia', false, 8),
  ('Colonoscopia', false, 9),
  ('Recepção', false, 10),
  ('UTI 1', true, 11),
  ('UTI 2', true, 12),
  ('UTI 3', true, 13),
  ('São José', true, 14),
  ('TMO', true, 15),
  ('Internamento', false, 16),
  ('Santo Expedito', true, 17),
  ('Nossa Senhora de Fátima', true, 18),
  ('São Judas Tadeu', true, 19),
  ('Santa Terezinha', true, 20),
  ('Padre João Maria', true, 21),
  ('Santa Luzia', true, 22),
  ('Necrotério', false, 23),
  ('Santa Isabel', true, 24),
  ('Hiperbárica', false, 25),
  ('Outros', false, 99)
on conflict (nome) do nothing;

insert into public.maqueiros (nome, turno, horario_inicio, horario_fim, setor_atuacao) values
  ('COOPESERV – CARLOS',               'Diurno',  '09:00', '21:00', 'Hospital'),
  ('ALISSON BRUNO NEPOMUCENO',         'Diurno',  '09:00', '21:00', 'Hospital'),
  ('HELIEBERTON DE SOUSA VIANA',       'Diurno',  '07:00', '19:00', 'Hospital'),
  ('LEOVANIO FERNANDES DA SILVA',      'Diurno',  '07:00', '19:00', 'CC'),
  ('JOAO BATISTA DE SOUSA JUNIOR',     'Diurno',  '07:00', '19:00', 'Hospital'),
  ('LUCIANO MARQUES DE S. JUNIOR',     'Diurno',  '07:00', '17:00', 'Hospital'),
  ('JOSE WILSON ENEAS PINHEIRO',       'Diurno',  '08:00', '18:00', 'Hospital'),
  ('GILMAR PEREIRA MARIANO',           'Diurno',  '06:00', '18:00', 'Hospital'),
  ('OSIVAN ZACARIAS DE LIMA JUNIOR',   'Diurno',  '06:00', '18:00', 'CC'),
  ('ADSON GOMES DE ALBUQUERQUE',       'Diurno',  '07:00', '19:00', 'Hospital'),
  ('JOÃO GUILHERME DOS ANJOS',         'Diurno',  '09:00', '21:00', 'Hospital'),
  ('JORGE RODRIGO RICA. DA NOBREGA',   'Diurno',  '07:00', '19:00', 'Hospital'),
  ('ROGERIO FRANCISCO SIQUEIRA',       'Diurno',  '07:00', '19:00', 'Hospital'),
  ('JAELSON GOMES DA SILVA',           'Noturno', '19:00', '07:00', 'Hospital'),
  ('VANEIR FELIPE',                    'Noturno', '19:00', '07:00', 'Hospital'),
  ('PAULO CESAR',                      'Noturno', '19:00', '07:00', 'Hospital'),
  ('REGINALDO MENDONÇA DA SILVA',      'Noturno', '19:00', '07:00', 'Hospital');

insert into public.configuracoes (chave, valor) values
  ('sla_minutos', '20'),
  ('meta_acionamento_minutos', '5'),
  ('usar_somente_numero_atendimento', 'false'),
  ('capacidade_manual', '{}')
on conflict (chave) do nothing;
