#!/usr/bin/env bash
# FAZ 3B-B test çalıştırıcı. ÜRETİM DB'sine ASLA bağlanmaz: geçici, yerel bir PostgreSQL kümesi kurar.
# Gereksinim: PostgreSQL 14+ ikili dosyaları (initdb, pg_ctl, psql). Yoksa PG entegrasyon testleri ATLANIR (PASS sayılmaz).
set -u
cd "$(dirname "$0")/../.."
export TSX_TSCONFIG_PATH="$PWD/tsconfig.json"
rc=0
echo "== birim testleri (saf mantık)"; npx tsx scripts/cms/verify-3b-b.ts || rc=1
echo "== mevcut regresyonlar (A1/A2)"
for f in verify-3b-a1 verify-intent-flow verify-form-key verify-3b-a2-projects verify-3b-a2-site verify-form-state verify-roundtrip; do
  echo "-- $f"; npx tsx "scripts/cms/$f.ts" || rc=1
done
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | tail -1)")}"
if [ ! -x "$PGBIN/initdb" ] || ! command -v psql >/dev/null; then
  echo "== PostgreSQL entegrasyon testleri: ATLANDI (initdb/psql bulunamadı). Bu bir PASS DEĞİLDİR."; exit $((rc==0 ? 3 : 1))
fi
if [ -n "${PG_TEST_HOST:-}" ]; then
  echo "== PG entegrasyon testleri (mevcut TEST sunucusu: $PG_TEST_HOST)"; npx tsx scripts/cms/verify-3b-b-pg.ts || rc=1
else
  TMP="$(mktemp -d)"; trap '"$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1; rm -rf "$TMP"' EXIT
  [ "$(id -u)" = 0 ] && { echo "root ile çalıştırmayın (initdb reddeder); PG_TEST_HOST ile mevcut test sunucusunu verin"; exit 2; }
  "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
  "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p 54329 -k $TMP -c listen_addresses=" -l "$TMP/log" -w start >/dev/null
  echo "== PG entegrasyon testleri (geçici küme)"
  PG_TEST_HOST="$TMP" PG_TEST_PORT=54329 PG_TEST_USER=postgres npx tsx scripts/cms/verify-3b-b-pg.ts || rc=1
fi
exit $rc
