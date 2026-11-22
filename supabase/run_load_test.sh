#!/usr/bin/env bash
# Day 5 load test on a throwaway local Postgres. Usage: ./run_load_test.sh [host] [port]
set -euo pipefail
H=${1:-/tmp/pg}; P=${2:-5433}; DB=epdms_load
psql -h "$H" -p "$P" -U postgres -qc "drop database if exists $DB" -c "create database $DB"
Q="psql -h $H -p $P -U postgres -d $DB -q -v ON_ERROR_STOP=1"
$Q -f "$(dirname "$0")/tests/00_shim.sql"
for f in "$(dirname "$0")"/migrations/*.sql; do $Q -f "$f"; done
time $Q -f "$(dirname "$0")/tests/load_test.sql"
