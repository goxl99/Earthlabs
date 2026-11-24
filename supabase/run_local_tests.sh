#!/usr/bin/env bash
# Runs every migration plus the RLS tests on a throwaway local Postgres. Usage: ./run_local_tests.sh [host] [port]
set -euo pipefail
H=${1:-/tmp/pg}; P=${2:-5433}; DB=epdms_test
psql -h "$H" -p "$P" -U postgres -qc "drop database if exists $DB" -c "create database $DB"
Q="psql -h $H -p $P -U postgres -d $DB -q -v ON_ERROR_STOP=1"
$Q -f "$(dirname "$0")/tests/00_shim.sql"
for f in "$(dirname "$0")"/migrations/*.sql; do case "$f" in *20261123000021*) $Q -f "$(dirname "$0")/tests/00b_storage_shim.sql";; esac; $Q -f "$f"; done
$Q -f "$(dirname "$0")/tests/rls_test.sql"
$Q -f "$(dirname "$0")/tests/build3_test.sql"
$Q -f "$(dirname "$0")/tests/build4_test.sql"
$Q -f "$(dirname "$0")/tests/build6_test.sql"
$Q -f "$(dirname "$0")/tests/build7_test.sql"
$Q -f "$(dirname "$0")/tests/build8_test.sql"
$Q -f "$(dirname "$0")/tests/build9_test.sql"
$Q -f "$(dirname "$0")/tests/build9b_test.sql"
$Q -f "$(dirname "$0")/tests/build10_test.sql"
$Q -f "$(dirname "$0")/tests/build11_test.sql"
$Q -f "$(dirname "$0")/tests/build12_test.sql"
$Q -f "$(dirname "$0")/tests/build14_test.sql"
