import { PROBE, setTitle, mark, staticMarkers } from '../fake-supabase/fixtures';
import { check, info } from '../lib/types';
import { code, fresh, get, guarded, noteUrl, sleep, verOf, type Ctx } from './common';

const titleVer = (t: string | null): string | null => { const m = t ? /F0PROBE-(v\d+)/.exec(t) : null; return m ? m[1] : null; };

/** M07: <title> (generateMetadata) ile gövde (<h1>) TTL sınırında aynı sürümü mü gösteriyor; eşzamanlı istek yığılması. */
export async function m07(ctx: Ctx) {
  return guarded('M07', 'Metadata–gövde tutarlılığı ve eşzamanlı istekler (TTL sınırı)', async (r) => {
    const ttl = ctx.ttl;
    fresh(ctx);
    const app = await ctx.start('m07-a');
    try {
      const t0 = Date.now();
      await get(noteUrl(app));
      // örneklemeye TTL'den ~8 sn önce başla; içeriği ~2 sn sonra (TTL'den ~6 sn önce) değiştir
      const lead = Math.max(0, (ttl - 8) * 1000 - (Date.now() - t0));
      await ctx.wait(lead);
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v2'));
      const samples = { n: 0, mismatch: 0, byVer: new Map<string, number>(), examples: [] as string[] };
      const end = t0 + (ttl + 14) * 1000;
      while (Date.now() < end) {
        const res = await get(noteUrl(app));
        samples.n += 1;
        const hv = verOf(res); const tv = titleVer(res.title);
        samples.byVer.set(String(hv), (samples.byVer.get(String(hv)) ?? 0) + 1);
        if (res.status === 200 && hv !== tv) { samples.mismatch += 1; if (samples.examples.length < 3) samples.examples.push(`t=${((Date.now() - t0) / 1000).toFixed(1)}s title=${tv} h1=${hv}`); }
        await sleep(ctx.quick ? 400 : 500);
      }
      r.checks.push(info('örnek sayısı / sürüm dağılımı', `${samples.n} örnek; ${[...samples.byVer].map(([k, v]) => `${k}:${v}`).join(', ')}`));
      r.checks.push(check('req', 'TTL sınırında <title> ve <h1> aynı sürümü gösterir', '0 uyumsuz örnek', `${samples.mismatch} uyumsuz${samples.examples.length ? ' (' + samples.examples.join('; ') + ')' : ''}`, samples.mismatch === 0));
    } finally { await app.stop(); }

    /* eşzamanlı istek yığılması: süre dolduktan sonra N paralel istek */
    fresh(ctx);
    const app2 = await ctx.start('m07-b');
    try {
      await get(noteUrl(app2));
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v2'));
      await ctx.wait((ttl + 3) * 1000);
      const sq = ctx.fake.lastSeq();
      const burst = await Promise.all(Array.from({ length: 20 }, () => get(noteUrl(app2))));
      const dist = new Map<string, number>();
      for (const b of burst) dist.set(`${code(b)}/${verOf(b)}`, (dist.get(`${code(b)}/${verOf(b)}`) ?? 0) + 1);
      const reqs = ctx.fake.log.filter((e) => e.seq > sq);
      r.checks.push(info('20 paralel istek (süre dolduktan sonra): yanıt dağılımı', [...dist].map(([k, v]) => `${k}×${v}`).join(', ')));
      r.checks.push(info('… bu sırada sahte sunucuya giden sorgular', `${reqs.length} (${[...new Set(reqs.map((e) => e.table))].join(', ')})`));
      r.checks.push(info('statik sızıntı kontrolü (burst)', String(burst.some((b) => staticMarkers().some((t) => b.body.includes(t))))));
    } finally { await app2.stop(); }
  });
}
