-- =====================================================================
-- EXEMPLO de escala de outubro/2026 (opcional, apenas para homologação).
-- Em produção, importe a planilha oficial pela tela Escala → Importar.
-- Padrão: plantões em dias alternados (metade da equipe em dias pares,
-- metade em ímpares); noturnos com N; JOÃO GUILHERME em férias de 05/10 a 03/11.
-- Atenção: um mês com qualquer registro passa a valer só pela escala
-- (quem não tem D/N/E no dia fica fora da escala).
-- =====================================================================
with m as (
  select id, nome, turno, row_number() over (order by nome) as rn
  from public.maqueiros where ativo
),
dias as (
  select d::date as dia from generate_series(date '2026-10-01', date '2026-10-31', interval '1 day') d
)
insert into public.escala_dias (maqueiro_id, data, tipo)
select m.id, dias.dia,
       case
         when m.nome like 'JOÃO GUILHERME%' and dias.dia >= date '2026-10-05' then 'F'
         when m.turno = 'Noturno' then 'N'
         else 'D'
       end
from m cross join dias
where (m.nome like 'JOÃO GUILHERME%' and dias.dia >= date '2026-10-05')
   or (extract(day from dias.dia)::int + m.rn::int) % 2 = 0
on conflict (maqueiro_id, data) do nothing;

-- As férias de 01/11 a 03/11 entram na escala de novembro (importar junto com o mês).
