import { check, info } from '../lib/types';
import { staticMarkers } from '../fake-supabase/fixtures';
import { AppExitedEarly } from '../lib/proc';
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

/** Uygulamanın (src/lib/content/build-guard.ts) başlatmayı reddederken verdiği sabitler. Burada KOPYA: düzenek uygulama kodunu import etmez. */
export const REFUSAL_CODE = 'CONTENT_SOURCE_BUILD_RUNTIME_MISMATCH';
export const REFUSAL_EXIT_CODE = 78;

export type RefusalClass = 'verified-refusal' | 'exited-other' | 'refusal-but-port-open' | 'not-refused';

/**
 * "Başlatma reddedildi" yalnızca ŞU ÜÇÜ BİRDEN doğruysa geçerli fail-closed sayılır:
 *   1) süreç beklenen çıkış koduyla (78) çıktı,
 *   2) günlükte beklenen kod VE beklenen build/runtime sınıfları var,
 *   3) çıkıştan sonra port bağlantı KABUL ETMİYOR (sunucu ayakta değil).
 * Yalnızca günlükte hata satırı görünmesi (süreç yaşıyor/yanıt veriyor) ya da başka nedenle çıkması geçerli DEĞİLDİR.
 */
export function classifyStartRefusal(a: { started: boolean; exitCode: number | null; logText: string; portOpenAfterExit: boolean; built: string; runtime: string }): RefusalClass {
  if (a.started) return 'not-refused';
  const logged = a.logText.includes(`${REFUSAL_CODE}: build=${a.built} runtime=${a.runtime}`);
  if (a.exitCode !== REFUSAL_EXIT_CODE || !logged) return 'exited-other';
  if (a.portOpenAfterExit) return 'refusal-but-port-open';
  return 'verified-refusal';
}

const refusalLabel: Record<RefusalClass, string> = {
  'verified-refusal': 'başlatma reddedildi (doğrulandı: çıkış kodu 78 + kodlu günlük + port kapalı)',
  'exited-other': 'süreç çıktı ama beklenen ret kanıtı yok (çıkış kodu/günlük uyuşmuyor)',
  'refusal-but-port-open': 'günlükte ret var ama port hâlâ bağlantı kabul ediyor',
  'not-refused': 'sunucu BAŞLADI (ret yok)',
};

/** Uygulamayı başlatmayı dener; erken çıkarsa kanıtları toplar. */
async function tryStart(ctx: Ctx, label: string, opts: Parameters<Ctx['start']>[1], built: string, runtime: string) {
  try {
    const app = await ctx.start(label, opts);
    return { app, cls: classifyStartRefusal({ started: true, exitCode: null, logText: '', portOpenAfterExit: false, built, runtime }), detail: 'sunucu başladı' };
  } catch (e) {
    if (!(e instanceof AppExitedEarly)) throw e;
    const probe = await get(`http://127.0.0.1:${e.port}/manifest.webmanifest`, 3000);
    const portOpen = typeof probe.status === 'number';
    const cls = classifyStartRefusal({ started: false, exitCode: e.exitCode, logText: e.logText, portOpenAfterExit: portOpen, built, runtime });
    return { app: null, cls, detail: `çıkış kodu ${e.exitCode ?? 'yok'}; port ${portOpen ? 'AÇIK' : 'kapalı'}; günlük kodu ${e.logText.includes(REFUSAL_CODE) ? 'var' : 'YOK'}` };
  }
}

/** M08: build kaynağı ≠ çalışma zamanı CONTENT_SOURCE. */
export async function m08(ctx: Ctx) {
  if (!ctx.sandboxes.static || !ctx.sandboxes.cms) return notRun('M08', 'Build ile çalışma zamanı kaynağı uyumsuzluğu', 'Her iki varyant da derlenmeden ölçülemez.');
  return guarded('M08', 'Build ile çalışma zamanı kaynağı uyumsuzluğu', async (r) => {
    const probeTitle = (b: string): boolean => /F0PROBE-v1/.test(b);
    const hasStatic = (b: string): boolean => staticMarkers().some((t) => b.includes(t));

    /* a) static build, runtime CONTENT_SOURCE=cms */
    fresh(ctx);
    const a = await tryStart(ctx, 'm08-a', { variant: 'static', source: 'cms' }, 'static', 'cms');
    if (a.app) {
      try {
        const sq = ctx.fake.lastSeq();
        const res = await get(a.app.baseUrl + '/notes');
        const dq = ctx.fake.countSince(sq);
        const cls = classifyRuntimeSource({ status: res.status, cmsMarker: probeTitle(res.body), staticSeen: hasStatic(res.body), dbRequests: dq });
        r.checks.push(info('static build + runtime cms: /notes', `HTTP ${code(res)}; CMS işareti ${probeTitle(res.body)}; statik içerik ${hasStatic(res.body)}; DB isteği ${dq}; sınıf=${cls}; x-nextjs-cache=${res.nextCache ?? '-'}`));
        const label: Record<RuntimeSourceClass, string> = { cms: 'CMS verisi', error: 'hata', static: 'SESSİZCE STATİK İÇERİK', unknown: 'BELİRSİZ (CMS işareti, statik içerik ve DB isteği yok)' };
        r.checks.push(check('req', 'runtime CONTENT_SOURCE=cms ise sayfa CMS’ten gelmeli (ya da uyumsuzluk hata vermeli)', 'CMS verisi, hata veya doğrulanmış başlatma reddi', label[cls], cls === 'cms' || cls === 'error'));
      } finally { await a.app.stop(); }
    } else {
      r.checks.push(info('static build + runtime cms: başlatma', a.detail));
      r.checks.push(check('req', 'runtime CONTENT_SOURCE=cms ise sayfa CMS’ten gelmeli (ya da uyumsuzluk hata vermeli)', 'CMS verisi, hata veya doğrulanmış başlatma reddi', refusalLabel[a.cls], a.cls === 'verified-refusal'));
    }

    /* b) cms build, runtime CONTENT_SOURCE=static */
    fresh(ctx);
    const sqB = ctx.fake.lastSeq();
    const b = await tryStart(ctx, 'm08-b', { variant: 'cms', source: 'static' }, 'cms', 'static');
    if (b.app) {
      try {
        const res = await get(b.app.baseUrl + '/notes');
        const dq = ctx.fake.countSince(sqB);
        r.checks.push(info('cms build + runtime static: /notes', `HTTP ${code(res)}; CMS işareti ${probeTitle(res.body)}; statik içerik ${hasStatic(res.body)}; DB isteği ${dq}`));
        r.checks.push(check('doc', 'runtime static: veritabanına istek yok', '0', String(dq), dq === 0));
        r.checks.push(check('req', 'cms build + runtime static: sessiz kaynak kayması olmamalı (hata veya doğrulanmış başlatma reddi)', 'doğrulanmış başlatma reddi (veya hata)', 'sunucu başladı ve sayfa sunuldu', typeof res.status === 'number' && res.status >= 500));
      } finally { await b.app.stop(); }
    } else {
      const dq = ctx.fake.countSince(sqB);
      r.checks.push(info('cms build + runtime static: başlatma', b.detail));
      r.checks.push(check('doc', 'runtime static: veritabanına istek yok', '0', String(dq), dq === 0));
      r.checks.push(check('req', 'cms build + runtime static: sessiz kaynak kayması olmamalı (hata veya doğrulanmış başlatma reddi)', 'doğrulanmış başlatma reddi (veya hata)', refusalLabel[b.cls], b.cls === 'verified-refusal'));
    }
  });
}
