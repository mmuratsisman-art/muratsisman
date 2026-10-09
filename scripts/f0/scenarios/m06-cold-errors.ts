import { PROBE } from '../fake-supabase/fixtures';
import type { Mode } from '../fake-supabase/server';
import { check, info } from '../lib/types';
import { staticMarkers } from '../fake-supabase/fixtures';
import { code, fresh, get, guarded, noteUrl, verOf, type Ctx } from './common';

const leak = (b: string): boolean => staticMarkers().some((t) => b.includes(t));

/** M06: soğuk başlangıçta farklı hata türleri; hata önbelleğe yazılıyor mu; yapılandırma hatası. */
export async function m06(ctx: Ctx) {
  return guarded('M06', 'Soğuk başlangıçta hata türleri ve yapılandırma hatası', async (r) => {
    fresh(ctx);
    const app = await ctx.start('m06-a');
    try {
      const modes: Mode[] = ['http500', 'http503', 'unauthorized', 'malformed', 'null', 'drop', 'hang'];
      const rows: string[][] = [];
      for (const m of modes) {
        ctx.fake.setMode('*', m);
        const res = await get(app.baseUrl + '/notes', 25000);
        const ok5 = typeof res.status === 'number' && res.status >= 500;
        rows.push([m, code(res), `${(res.ms / 1000).toFixed(1)}s`, leak(res.body) ? 'EVET' : 'hayır', res.error ?? '']);
        if (m === 'hang') {
          r.checks.push(check('req', 'Supabase yanıt vermezse (hang) istek makul sürede sonuçlanmalı', '≤ 20 sn içinde yanıt', res.status === 'ERR' ? `25 sn içinde yanıt yok (${res.error})` : `${(res.ms / 1000).toFixed(1)} sn, HTTP ${code(res)}`, res.status !== 'ERR' && res.ms <= 20000));
          ctx.fake.releaseHung();
        } else {
          r.checks.push(check('req', `mod ${m}: 5xx ve statik sızıntı yok`, 'HTTP 5xx, sızıntı yok', `HTTP ${code(res)}, sızıntı ${leak(res.body)}`, ok5 && !leak(res.body)));
        }
      }
      r.timeline = [['mod', 'HTTP', 'süre', 'statik sızıntı', 'hata'], ...rows];
      ctx.fake.resetModes();
      const rec = await get(app.baseUrl + '/notes');
      r.checks.push(check('doc', 'hatalar önbelleğe yazılmaz: sunucu düzelince /notes', 'HTTP 200', `HTTP ${code(rec)}`, rec.status === 200));
      const det = await get(noteUrl(app));
      r.checks.push(check('doc', '… ve detay', 'v1', verOf(det) ?? code(det), verOf(det) === 'v1'));
    } finally { await app.stop(); }

    /* yalnız site belgeleri (kimlik) bozuk */
    fresh(ctx);
    ctx.fake.setMode('site_content_published', 'http500');
    const app2 = await ctx.start('m06-b');
    try {
      const n = await get(app2.baseUrl + '/notes');
      const nf = await get(app2.baseUrl + '/zzz-eslesmeyen');
      r.checks.push(check('doc', 'site belgeleri 500: içerik sayfası (kısmi site gösterilmez)', 'HTTP 5xx', `HTTP ${code(n)}`, typeof n.status === 'number' && n.status >= 500));
      r.checks.push(check('doc', 'site belgeleri 500: 404 sayfası kimlik fallback ile açılır', 'HTTP 404', `HTTP ${code(nf)}`, nf.status === 404));
      r.checks.push(info('404 sayfası <title> / "static-fallback" kimlik', nf.title ?? '(yok)'));
    } finally { await app2.stop(); }

    /* geçersiz CONTENT_SOURCE */
    fresh(ctx);
    const app3 = await ctx.start('m06-c', { source: 'cmss' });
    try {
      const home = await get(app3.baseUrl + '/');
      const nf = await get(app3.baseUrl + '/zzz-eslesmeyen');
      r.checks.push(check('doc', 'geçersiz CONTENT_SOURCE: sessizce static/cms seçilmez', 'HTTP 5xx (fail-closed)', `/ → HTTP ${code(home)}; /zzz → HTTP ${code(nf)}`, typeof home.status === 'number' && home.status >= 500));
      r.checks.push(info('geçersiz CONTENT_SOURCE: hata arayüzü', `${/Tekrar dene/i.test(home.body) ? 'error.tsx' : 'Next varsayılan hata'}; probe=${PROBE.noteSlug}`));
    } finally { await app3.stop(); }
  });
}
