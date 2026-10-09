import { PROBE, setStatus } from '../fake-supabase/fixtures';
import { fmtS } from '../lib/http';
import { check, info } from '../lib/types';
import { code, fresh, get, guarded, noteUrl, sleep, verOf, type Ctx } from './common';

/** M05: ısınmış cache + sürekli Supabase kesintisi + (kaynakta) yayından kaldırma. */
export async function m05(ctx: Ctx) {
  return guarded('M05', 'Kesinti sırasında eski içerik sunumu (sınırsız mı?)', async (r) => {
    const ttl = ctx.ttl;
    const pollMs = ctx.quick ? 5000 : 15000;
    const windowS = ttl * (ctx.quick ? 2.5 : 5);
    fresh(ctx);
    const app = await ctx.start('m05');
    try {
      const warm = await get(noteUrl(app));
      const list = await get(app.baseUrl + '/notes');
      r.checks.push(check('infra', 'ön koşul: ısınmış cache', 'v1', verOf(warm) ?? code(warm), verOf(warm) === 'v1' && /F0PROBE-v1/.test(list.body)));
      // kaynakta yayından kaldırıldı VE sonra Supabase erişilemez oldu
      setStatus(ctx.fake.world, 'notes', PROBE.noteSlug, 'draft');
      ctx.fake.setMode('*', 'http500');
      const t0 = Date.now();
      const rows: string[][] = [];
      let firstNon200: number | null = null; let firstGone: number | null = null; let stale = 0; let last: string = '';
      for (;;) {
        const t = (Date.now() - t0) / 1000;
        if (t > windowS) break;
        const sq = ctx.fake.lastSeq();
        const res = await get(noteUrl(app));
        const showsStale = res.status === 200 && verOf(res) === 'v1';
        if (showsStale) stale += 1;
        if (res.status !== 200 && firstNon200 === null) firstNon200 = t;
        if (!showsStale && firstGone === null) firstGone = t;
        last = `HTTP ${code(res)} ${verOf(res) ?? ''}`;
        rows.push([fmtS(Date.now() - t0), code(res), verOf(res) ?? '-', String(ctx.fake.countSince(sq)), res.nextCache ?? '-']);
        await sleep(pollMs);
      }
      r.timeline = [['t', 'HTTP', 'sürüm', 'DB deneme sayısı', 'x-nextjs-cache'], ...rows];
      const stillStale = last.startsWith('HTTP 200') && last.includes('v1');
      r.checks.push(info('gözlem penceresi', `${windowS} sn (TTL ${ttl} sn × ${windowS / ttl}); eski içerik sunulan yanıt: ${stale}/${rows.length}`));
      r.checks.push(info('ilk 200-dışı yanıt', firstNon200 === null ? 'pencere boyunca YOK' : `${firstNon200.toFixed(1)} sn`));
      r.checks.push(check('doc', 'TTL dolunca (belgedeki iddia) hata sayfası', `≤ ${ttl + 20} sn içinde 200-dışı`, firstNon200 === null ? 'hiç olmadı' : `${firstNon200.toFixed(1)} sn`, firstNon200 !== null && firstNon200 <= ttl + 20));
      r.checks.push(check('req', 'kesintide yayından kaldırılmış içerik SINIRSIZ sunulmamalı', `pencere sonunda eski içerik yok (${windowS} sn)`, `son yanıt: ${last}`, !stillStale));
      r.observations.push(stillStale ? `Gözlem: ${windowS} sn boyunca kesinti sürdü ve yayından kaldırılmış içerik hâlâ sunuluyor (sınır gözlenmedi).` : 'Gözlem: eski içerik bir noktada kesildi; zaman çizelgesine bakın.');
      // toparlanma
      ctx.fake.resetModes();
      const r0 = Date.now();
      let recovered: number | null = null;
      while ((Date.now() - r0) / 1000 < 40) {
        const res = await get(noteUrl(app));
        if (res.status === 404) { recovered = (Date.now() - r0) / 1000; break; }
        await sleep(2000);
      }
      r.checks.push(info('Supabase dönünce 404’e ulaşma süresi', recovered === null ? '40 sn içinde ulaşılmadı' : `${recovered.toFixed(1)} sn`));
    } finally { await app.stop(); }
  });
}
