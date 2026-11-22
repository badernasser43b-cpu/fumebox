#!/bin/bash
# Recreate the local test database from the production SQL files.
set -e
P="psql -h /tmp/pg -p 5433 -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists cc with (force);" -c "create database cc;" >/dev/null
for f in tests/supabase_stubs.sql supabase/schema.sql supabase/storage.sql supabase/seed.sql; do
  $P -d cc -f "$f" 2>&1 | grep -v NOTICE || true
done
$P -d cc -c "insert into admins(user_id, note) values ('11111111-1111-1111-1111-111111111111','test admin');"
