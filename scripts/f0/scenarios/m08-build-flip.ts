import { check, info } from '../lib/types';
import { staticMarkers } from '../fake-supabase/fixtures';
import { code, fresh, get, guarded, notRun, type Ctx } from './common';

export type RuntimeSourceClass = 'cms' | 'error' | 'static' | 'unknown';

/**
 * Sayfanın hangi kaynaktan geldiğini ÖNCE doğrudan gözlenen içerikten çıkarır; DB isteği sayısı yalnızca son çare ipucudur.
 * (Eski kural "pencerede herhangi bir DB isteği var ⇒ CMS" idi: aynı ölçüm penceresine düşen başka bir isteği bu sayfaya atfedebiliyordu.)
 */
export function classifyRuntimeSource(a: { status: number | 'ERR'; cmsMarker: boolean; staticSeen: boolean; dbRequests: number }): RuntimeSourceClass {
  if (typeof a.status === 'number' && a.status >= 500) return 'error';
  if (a.cmsMarker) return 'cms';
  if (a.staticSeen) return 'static';
  return a.dbRequests > 0 ? 'cms' : 'unknown';
}

/** M08: build kaynağı ≠ çalışma zamanı CONTENT_SOURCE. */
export async function m08(ctx: Ctx) {
  if (!ctx.sandboxes.static || !ctx.sandboxes.cms) return notRun('M08', 'Build ile çalışma zamanı kaynağı uyumsuzluğu', 'Her iki varyant da derlenmeden ölçülemez.');
  return guarded('M08', 'Build ile çalışma zamanı kaynağı uyumsuzluğu', async (r) => {
    const probeTitle = (b: string): boolean => /F0PROBE-v1/.test(b);
    const hasStatic = (b: string): boolean => staticMarkers().some((t) => b.includes(t));

    /* a) static build, runtime CONTENT_SOURCE=cms */
    fresh(ctx);
    const a = await ctx.start('m08-a', { variant: 'static', source: 'cms' });
    try {
      const sq = ctx.fake.lastSeq();
      const res = await get(a.baseUrl + '/notes');
      const dq = ctx.fake.countSince(sq);
      const cls = classifyRuntimeSource({ status: res.status, cmsMarker: probeTitle(res.body), staticSeen: hasStatic(res.body), dbRequests: dq });
      r.checks.push(info('static build + runtime cms: /notes', `HTTP ${code(res)}; CMS işareti ${probeTitle(res.body)}; statik içerik ${hasStatic(res.body)}; DB isteği ${dq}; sınıf=${cls}; x-nextjs-cache=${res.nextCache ?? '-'}`));
      const label: Record<RuntimeSourceClass, string> = { cms: 'CMS verisi', error: 'hata', static: 'SESSİZCE STATİK İÇERİK', unknown: 'BELİRSİZ (CMS işareti, statik içerik ve DB isteği yok)' };
      r.checks.push(check('req', 'runtime CONTENT_SOURCE=cms ise sayfa CMS’ten gelmeli (ya da uyumsuzluk hata vermeli)', 'CMS verisi veya hata', label[cls], cls === 'cms' || cls === 'error'));
    } finally { await a.stop(); }

    /* b) cms build, runtime CONTENT_SOURCE=static */
    fresh(ctx);
    const b = await ctx.start('m08-b', { variant: 'cms', source: 'static' });
    try {
      const sq = ctx.fake.lastSeq();
      const res = await get(b.baseUrl + '/notes');
      const dq = ctx.fake.countSince(sq);
      r.checks.push(info('cms build + runtime static: /notes', `HTTP ${code(res)}; CMS işareti ${probeTitle(res.body)}; statik içerik ${hasStatic(res.body)}; DB isteği ${dq}`));
      r.checks.push(check('doc', 'runtime static: veritabanına istek yok', '0', String(dq), dq === 0));
    } finally { await b.stop(); }
  });
}
