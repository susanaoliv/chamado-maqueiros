#!/usr/bin/env bash
# Recria um banco PostgreSQL local, aplica migrations + seed e roda os testes de RLS/regras.
# Uso: PGURL=postgres://postgres@localhost/postgres scripts/test-db-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN_URL="${PGURL:-postgres://postgres@localhost:5432/postgres}"
DB="maqueiros_test"
psql "$ADMIN_URL" -q -c "drop database if exists $DB" -c "create database $DB"
URL="${ADMIN_URL%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/tests/local/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
psql "$URL" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_e_regras.sql
psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/despacho_app.sql

# Critério 4: número nunca repete, mesmo com abertura simultânea (500 chamados em 20 conexões)
psql "$URL" -q -c "insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000c1','carga@maqueiros.cssl');
  insert into public.perfis (id, usuario, papel, nome) values ('00000000-0000-0000-0000-0000000000c1','carga','telefonista','Carga');"
pgbench -n -c 20 -j 4 -t 25 -f supabase/tests/local/abrir_concorrente.sql "$URL" | grep -E "processed|failed"
psql "$URL" -At -c "select case when count(*) = 500 and count(distinct numero) = 500 then 'NUMERAÇÃO CONCORRENTE OK' else 'FALHA: numeração repetida' end from public.chamados" | tee /dev/stderr | grep -q OK
