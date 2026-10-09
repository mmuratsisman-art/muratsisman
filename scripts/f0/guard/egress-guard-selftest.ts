/**
 * Guard ön-doğrulaması: guard'ın GERÇEKTEN engellediğini, ayrı bir node sürecinde kanıtlar.
 * Başarısızsa ölçüm BAŞLATILMAZ.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGuardLog } from '../lib/proc';
import { check, type Check } from '../lib/types';

const CHILD = `
const net = require('node:net'); const http = require('node:http'); const dns = require('node:dns'); const tls = require('node:tls'); const https = require('node:https');
const out = {};
const rec = (k, v) => { out[k] = v; };
const srv = http.createServer((q, s) => s.end('ok')).listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  // 1) loopback İZİNLİ
  try { const r = await fetch('http://127.0.0.1:' + port + '/'); rec('loopback-fetch', (await r.text()) === 'ok' ? 'allowed' : 'bad'); } catch (e) { rec('loopback-fetch', 'ERR ' + e.message); }
  try { const r = await fetch('http://localhost:' + port + '/').catch((e) => ({ text: async () => 'ERR ' + e.message })); rec('localhost-fetch', (await r.text()) === 'ok' ? 'allowed' : 'maybe-ipv6'); } catch (e) { rec('localhost-fetch', 'ERR'); }
  // 2) dış hedefler ENGELLİ
  try { await fetch('http://192.0.2.1:80/'); rec('fetch-ip', 'NOT-BLOCKED'); } catch (e) { rec('fetch-ip', String((e.cause && e.cause.code) || e.code || e.message).includes('F0_EGRESS') || String(e.cause && e.cause.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message); }
  try { await fetch('https://example.supabase.co/rest/v1/x'); rec('fetch-host', 'NOT-BLOCKED'); } catch (e) { rec('fetch-host', String(e.cause && e.cause.message).includes('F0_EGRESS') || String(e.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message + '|' + (e.cause && e.cause.message)); }
  try { await new Promise((res, rej) => { const s = net.connect({ host: '198.51.100.7', port: 443 }); s.on('connect', () => res()); s.on('error', rej); }); rec('net-connect', 'NOT-BLOCKED'); } catch (e) { rec('net-connect', String(e.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message); }
  try { tls.connect({ host: '203.0.113.9', port: 443 }); rec('tls-connect', 'NOT-BLOCKED'); } catch (e) { rec('tls-connect', String(e.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message); }
  try { await new Promise((res, rej) => dns.lookup('example.com', (e, a) => (e ? rej(e) : res(a)))); rec('dns-lookup', 'NOT-BLOCKED'); } catch (e) { rec('dns-lookup', String(e.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message); }
  try { await dns.promises.resolve4('example.com'); rec('dns-resolve4', 'NOT-BLOCKED'); } catch (e) { rec('dns-resolve4', String(e.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message); }
  try { await new Promise((res, rej) => https.get('https://example.com/', res).on('error', rej)); rec('https-get', 'NOT-BLOCKED'); } catch (e) { rec('https-get', String(e.message).includes('F0_EGRESS') ? 'blocked' : 'failed-other:' + e.message); }
  console.log('RESULT ' + JSON.stringify(out)); srv.close(); process.exit(0);
});
setTimeout(() => { console.log('RESULT {"timeout":true}'); process.exit(3); }, 20000).unref();
`;

export async function runGuardSelftest(guardPath: string): Promise<{ ok: boolean; checks: Check[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'f0-guard-'));
  const log = join(dir, 'guard.jsonl');
  try {
    const res = spawnSync(process.execPath, ['-r', guardPath, '-e', CHILD], {
      // Açık, sabit ve tiplenmiş ortam: yalnız PATH/SystemRoot + guard günlüğü; NODE_ENV sabit 'test' (ana makineden devralınmaz).
      env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', F0_GUARD_LOG: log },
      encoding: 'utf8', timeout: 30000, windowsHide: true,
    });
    const line = (res.stdout ?? '').split('\n').find((l) => l.startsWith('RESULT '));
    const parsed = line ? (JSON.parse(line.slice(7)) as Record<string, string>) : {};
    const checks: Check[] = [];
    checks.push(check('infra', 'guard: loopback fetch izinli', 'allowed', parsed['loopback-fetch'] ?? 'sonuç yok', parsed['loopback-fetch'] === 'allowed'));
    for (const k of ['fetch-ip', 'fetch-host', 'net-connect', 'tls-connect', 'dns-lookup', 'dns-resolve4', 'https-get']) {
      checks.push(check('infra', `guard: ${k} ENGELLENİR`, 'blocked', parsed[k] ?? 'sonuç yok', parsed[k] === 'blocked'));
    }
    const logRecs = readGuardLog(log);
    checks.push(check('infra', 'guard: engellemeler günlüğe yazıldı', '≥ 6 "blocked" kaydı', `${logRecs.filter((r) => r.kind === 'blocked').length}`, logRecs.filter((r) => r.kind === 'blocked').length >= 6));
    checks.push(check('infra', 'guard: yüklenme kaydı', 'guard-loaded', logRecs.some((r) => r.kind === 'guard-loaded') ? 'var' : 'yok', logRecs.some((r) => r.kind === 'guard-loaded')));
    return { ok: checks.every((c) => c.verdict === 'PASS'), checks };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
