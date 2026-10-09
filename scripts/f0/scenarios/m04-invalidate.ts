import { PROBE, setStatus, setTitle, mark } from '../fake-supabase/fixtures';
import { check, info } from '../lib/types';
import { code, fresh, get, guarded, noteUrl, verOf, type Ctx } from './common';

/** M04: etiketle / path ile / gerçek fonksiyonla geçersiz kılma; kesintide geçersiz kılma. */
export async function m04(ctx: Ctx) {
  return guarded('M04', 'Cache geçersiz kılma (probe route; yalnız sandbox)', async (r) => {
    fresh(ctx);
    const app = await ctx.start('m04');
    try {
      const warm = await get(noteUrl(app));
      r.checks.push(check('infra', 'ön koşul: ısınmış cache', 'v1', verOf(warm) ?? code(warm), verOf(warm) === 'v1'));

      // a) etiket
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v2'));
      const pa = await ctx.probe(app, 'tag');
      if (pa.status !== 200) { r.status = 'NOT RUN'; r.notRunReason = `probe route yanıtı HTTP ${pa.status} (route sandbox'a eklenmemiş olabilir)`; return; }
      const a = await get(noteUrl(app));
      r.checks.push(check('doc', 'revalidateTag(cms-public) sonrası ilk istek taze', 'v2', verOf(a) ?? code(a), verOf(a) === 'v2'));

      // b) yalnız path
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v3'));
      await ctx.probe(app, 'path');
      const b = await get(noteUrl(app));
      r.checks.push(info('yalnız revalidatePath("/", "layout") sonrası ilk istek', `${verOf(b) ?? code(b)} (v3 = veri önbelleği de yenilendi; v2 = yenilenmedi)`));

      // c) gerçek fonksiyon (tag + path)
      await ctx.probe(app, 'real');
      const c = await get(noteUrl(app));
      r.checks.push(check('doc', 'revalidatePublicContent() (gerçek yol) sonrası ilk istek taze', 'v3', verOf(c) ?? code(c), verOf(c) === 'v3'));

      // d) yayından kaldırma + geçersiz kılma
      setStatus(ctx.fake.world, 'notes', PROBE.noteSlug, 'draft');
      await ctx.probe(app, 'real');
      const d = await get(noteUrl(app));
      const dl = await get(app.baseUrl + '/notes');
      r.checks.push(check('doc', 'unpublish + geçersiz kılma → bir sonraki istek 404', 'HTTP 404', `HTTP ${code(d)}`, d.status === 404));
      r.checks.push(check('doc', '… listede de yok', 'işaret yok', String(/F0PROBE-/.test(dl.body)), !/F0PROBE-/.test(dl.body)));

      // e) kesintide geçersiz kılma: eski içerik sunulmamalı
      setStatus(ctx.fake.world, 'notes', PROBE.noteSlug, 'published');
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v4'));
      await ctx.probe(app, 'real');
      const warm4 = await get(noteUrl(app));
      r.checks.push(check('infra', 'e) ön koşul: v4 ısıtıldı', 'v4', verOf(warm4) ?? code(warm4), verOf(warm4) === 'v4'));
      ctx.fake.setMode('*', 'http500');
      await ctx.probe(app, 'real');
      const e = await get(noteUrl(app));
      r.checks.push(check('req', 'kesintide geçersiz kılma sonrası eski içerik sunulmamalı', 'HTTP 5xx (v4 DEĞİL)', `HTTP ${code(e)} ${verOf(e) ?? ''}`, !(e.status === 200 && verOf(e) === 'v4') && e.status !== 200));
      ctx.fake.resetModes();
      const rec = await get(noteUrl(app));
      r.checks.push(check('doc', 'sunucu düzelince hata önbellekte kalmaz', 'HTTP 200 / v4', `HTTP ${code(rec)} / ${verOf(rec)}`, rec.status === 200 && verOf(rec) === 'v4'));
    } finally { await app.stop(); }
  });
}
