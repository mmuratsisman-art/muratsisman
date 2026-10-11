#!/usr/bin/env bash
# Visitor Analytics test çalıştırıcı. TEST/ÜRETİM Supabase'e ASLA bağlanmaz. PG testi için PG_TEST_HOST/PG_TEST_PORT (yerel geçici sunucu) gerekir; yoksa ATLANIR (PASS sayılmaz).
set -u
cd "$(dirname "$0")/../.."
export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"
rc=0
echo "== Analytics birim/kaynak testleri"; npx tsx scripts/cms/verify-analytics.ts || rc=1
echo "== Analytics PG (migration 0007, RLS/RPC smoke, katalog karşılaştırması, geri alma)"; npx tsx scripts/cms/verify-analytics-pg.ts || rc=1
exit $rc
