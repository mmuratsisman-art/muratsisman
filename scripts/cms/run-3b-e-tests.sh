#!/usr/bin/env bash
# FAZ 3B-E test çalıştırıcı. ÜRETİM DB'sine ASLA bağlanmaz. PG testi için PG_TEST_HOST/PG_TEST_PORT (yerel test sunucusu) gerekir; yoksa ATLANIR (PASS sayılmaz).
set -u
cd "$(dirname "$0")/../.."
export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"
rc=0
echo "== 3B-E birim/kaynak testleri"; npx tsx scripts/cms/verify-3b-e.ts || rc=1
echo "== 3B-E PG (gerçek şema + RLS, anon)"; npx tsx scripts/cms/verify-3b-e-pg.ts || rc=1
exit $rc
