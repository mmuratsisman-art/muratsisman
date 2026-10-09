import { firstCaseStudySlug, PROBE, staticMarkers } from '../fake-supabase/fixtures';
import { check, info } from '../lib/types';
import { code, fresh, get, guarded, noteUrl, verOf, type Ctx } from './common';

export async function m01(ctx: Ctx) {
  return guarded('M01', 'HTTP durum kodları (yayınlanmış / yok / hata / boş)', async (r) => {
    /* A) normal */
    fresh(ctx);
    const app = await ctx.start('m01-a');
    try {
      const proj = firstCaseStudySlug();
      const cases: [string, string, number, boolean][] = [
        ['/', 'ana sayfa', 200, true],
        ['/notes', 'not listesi', 200, true],
        [`/notes/${PROBE.noteSlug}`, 'yayınlanmış not', 200, true],
        [`/lab/${PROBE.labSlug}`, 'yayınlanmış lab', 200, false],
        [`/projects/${proj}`, 'yayınlanmış proje', 200, false],
        [`/notes/${PROBE.draftNoteSlug}`, 'taslak not', 404, false],
        ['/notes/olmayan-kayit', 'olmayan slug', 404, false],
        ['/notes/Bad_Slug', 'geçersiz slug', 404, false],
        [`/notes/${'x'.repeat(200)}`, '200 karakterli slug', 404, false],
        ['/zzz-eslesmeyen', 'eşleşmeyen URL', 404, false],
      ];
      for (const [path, label, want, markerExpected] of cases) {
        const res = await get(app.baseUrl + path);
        r.checks.push(check('doc', `${label} (${path.length > 40 ? path.slice(0, 37) + '...' : path})`, `HTTP ${want}`, `HTTP ${code(res)}${res.nextCache ? ` x-nextjs-cache=${res.nextCache}` : ''}`, res.status === want));
        if (markerExpected && want === 200) r.checks.push(check('doc', `${label}: fixture işareti sayfada`, 'F0PROBE-v1 var', (verOf(res) ?? (/F0PROBE-v1/.test(res.body) ? 'v1' : 'yok')), verOf(res) === 'v1' || /F0PROBE-v1/.test(res.body)));
        if (want === 200) r.observations.push(`${path} cache-control: ${res.cacheControl ?? '-'}`);
      }
    } finally { await app.stop(); }

    /* B) soğuk başlangıç + Supabase 500 */
    fresh(ctx);
    ctx.fake.setMode('*', 'http500');
    const bad = await ctx.start('m01-b');
    try {
      for (const path of ['/', '/notes', `/notes/${PROBE.noteSlug}`, '/lab']) {
        const res = await get(bad.baseUrl + path);
        const is5xx = typeof res.status === 'number' && res.status >= 500;
        r.checks.push(check('req', `Supabase 500 → ${path}: 5xx (200 DEĞİL)`, 'HTTP 5xx', `HTTP ${code(res)}${res.error ? ' ' + res.error : ''}`, is5xx));
        r.checks.push(check('req', `Supabase 500 → ${path}: statik içerik sızıntısı yok`, 'gövdede statik not başlığı yok', staticLeakText(res.body) ? 'SIZINTI VAR' : 'yok', !staticLeakText(res.body)));
        r.checks.push(info(`Supabase 500 → ${path}: hata arayüzü`, `${/Tekrar dene/i.test(res.body) ? '"Tekrar dene" var (error.tsx)' : 'error.tsx metni yok'}; cache-control=${res.cacheControl ?? '-'}`));
      }
      const nf = await get(bad.baseUrl + '/zzz-eslesmeyen');
      r.checks.push(check('doc', 'Supabase 500 iken eşleşmeyen URL', 'HTTP 404 (kimlik için statik fallback)', `HTTP ${code(nf)}`, nf.status === 404));
      r.checks.push(info('Supabase 500: 404 sayfası başlığı', nf.title ?? '(yok)'));
    } finally { await bad.stop(); }

    /* C) boş içerik (200 ve []) */
    fresh(ctx);
    for (const t of ['projects', 'lab_entries', 'notes'] as const) ctx.fake.setMode(t, 'empty');
    const empt = await ctx.start('m01-c');
    try {
      const list = await get(empt.baseUrl + '/notes');
      r.checks.push(check('doc', 'boş yayın: /notes', 'HTTP 200 (boş durum), 5xx DEĞİL', `HTTP ${code(list)}`, list.status === 200));
      r.checks.push(check('req', 'boş yayın: statik içerik sızıntısı yok', 'yok', staticLeakText(list.body) ? 'SIZINTI VAR' : 'yok', !staticLeakText(list.body)));
      const det = await get(noteUrl(empt));
      r.checks.push(check('doc', 'boş yayın: not detayı', 'HTTP 404', `HTTP ${code(det)}`, det.status === 404));
    } finally { await empt.stop(); }
  });
}

const staticLeakText = (body: string): boolean => staticMarkers().some((t) => body.includes(t));
