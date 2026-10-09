import { PROBE, setStatus, setTitle, mark } from '../fake-supabase/fixtures';
import { fmtS } from '../lib/http';
import { check, info } from '../lib/types';
import { code, fresh, get, guarded, noteUrl, sleep, verOf, type Ctx } from './common';

/** M02: TTL ve stale-while-revalidate (sürüm değişimi). */
export async function m02(ctx: Ctx) {
  return guarded('M02', 'TTL ve stale-while-revalidate (içerik güncellemesi)', async (r) => {
    const ttl = ctx.ttl;
    const pollMs = ctx.quick ? 1000 : 5000;
    /* A) sürekli yoklama */
    fresh(ctx);
    const app = await ctx.start('m02-a');
    try {
      const t0 = Date.now();
      const seq0 = ctx.fake.lastSeq();
      const a = await get(noteUrl(app));
      const reqFill = ctx.fake.countSince(seq0);
      const seq1 = ctx.fake.lastSeq();
      const b = await get(noteUrl(app));
      const reqHit = ctx.fake.countSince(seq1);
      r.checks.push(check('doc', 'ilk istek v1', 'HTTP 200 / v1', `HTTP ${code(a)} / ${verOf(a)}`, a.status === 200 && verOf(a) === 'v1'));
      r.checks.push(check('doc', 'TTL içinde ikinci istek önbellekten', 'sahte sunucuya yeni istek yok', `${reqHit} yeni istek (ilk istek ${reqFill} sorgu; 2. yanıt ${verOf(b)})`, reqHit === 0));
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v2'));
      const changedAt = Date.now() - t0;
      const rows: string[][] = [];
      const horizon = ttl * (ctx.quick ? 1.6 : 2.5);
      let firstV2: number | null = null; let staleAfterTtl = 0;
      for (;;) {
        const t = (Date.now() - t0) / 1000;
        if (t > horizon) break;
        const sq = ctx.fake.lastSeq();
        const res = await get(noteUrl(app));
        const v = verOf(res);
        rows.push([fmtS(Date.now() - t0), code(res), v ?? '-', String(ctx.fake.countSince(sq)), res.nextCache ?? '-']);
        if (v === 'v2' && firstV2 === null) firstV2 = t;
        if (t > ttl && v === 'v1') staleAfterTtl += 1;
        await sleep(pollMs);
      }
      r.timeline = [['t', 'HTTP', 'sürüm', 'yeni DB isteği', 'x-nextjs-cache'], ...rows];
      r.checks.push(info(`v2 ilk ne zaman görüldü (içerik t=${fmtS(changedAt)} değişti)`, firstV2 === null ? 'görülmedi' : `${firstV2.toFixed(1)} sn`));
      r.checks.push(check('doc', 'v2, TTL + 1 sn içinde görünür (belgedeki "~60 sn" iddiası)', `≤ ${ttl + 1} sn`, firstV2 === null ? 'görülmedi' : `${firstV2.toFixed(1)} sn`, firstV2 !== null && firstV2 <= ttl + 1));
      r.observations.push(`TTL (${ttl} sn) sonrası v1 (eski) yanıt sayısı: ${staleAfterTtl}`);
    } finally { await app.stop(); }

    /* B) boşta kal, sonra TEK istek: SWR'nin ayırt edici ölçümü */
    fresh(ctx);
    const app2 = await ctx.start('m02-b');
    try {
      const f = await get(noteUrl(app2));
      r.checks.push(check('infra', 'B: doldurma isteği', 'v1', verOf(f) ?? 'yok', verOf(f) === 'v1'));
      setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v2'));
      await ctx.wait((ttl + 10) * 1000);
      const sq = ctx.fake.lastSeq();
      const first = await get(noteUrl(app2));
      await ctx.wait(3000);
      const second = await get(noteUrl(app2));
      r.checks.push(info('B: TTL+10 sn boşluktan sonra 1. istek / 3 sn sonra 2. istek', `${verOf(first)} / ${verOf(second)} (yeni DB isteği: ${ctx.fake.countSince(sq)})`));
      r.checks.push(check('doc', 'B: TTL sonrası İLK istek taze veriyi görür', 'v2', verOf(first) ?? code(first), verOf(first) === 'v2'));
      r.checks.push(check('doc', 'B: 2. istek taze', 'v2', verOf(second) ?? code(second), verOf(second) === 'v2'));
      r.observations.push(verOf(first) === 'v1' && verOf(second) === 'v2' ? 'Gözlem: stale-while-revalidate DOĞRULANDI (süre dolunca ilk istek eski veriyi alır, arka planda yenilenir).' : 'Gözlem: bu çalıştırmada SWR deseni (v1 sonra v2) görülmedi; yukarıdaki sürümlere bakın.');
    } finally { await app2.stop(); }
  });
}

/** M03: yayından kaldırma, geçersiz kılma olmadan (yalnız TTL). */
export async function m03(ctx: Ctx) {
  return guarded('M03', 'Yayından kaldırma, geçersiz kılma olmadan (yalnız TTL)', async (r) => {
    const ttl = ctx.ttl;
    fresh(ctx);
    const app = await ctx.start('m03');
    try {
      const w = await get(noteUrl(app));
      const l = await get(app.baseUrl + '/notes');
      r.checks.push(check('infra', 'ön koşul: yayında', 'detay v1, listede işaret', `${code(w)}/${verOf(w)}; listede ${/F0PROBE-v1/.test(l.body)}`, w.status === 200 && /F0PROBE-v1/.test(l.body)));
      setStatus(ctx.fake.world, 'notes', PROBE.noteSlug, 'draft'); // kaynakta yayından kaldırıldı (anon artık görmez)
      await ctx.wait((ttl + 10) * 1000);
      const d1 = await get(noteUrl(app));
      const l1 = await get(app.baseUrl + '/notes');
      await ctx.wait(3000);
      const d2 = await get(noteUrl(app));
      const l2 = await get(app.baseUrl + '/notes');
      r.checks.push(info('TTL sonrası 1. istek: detay / liste', `HTTP ${code(d1)} / listede işaret ${/F0PROBE-v1/.test(l1.body)}`));
      r.checks.push(info('3 sn sonra 2. istek: detay / liste', `HTTP ${code(d2)} / listede işaret ${/F0PROBE-v1/.test(l2.body)}`));
      r.checks.push(check('req', 'yayından kaldırılan içerik TTL sonrası İLK istekte görünmemeli (detay)', 'HTTP 404', `HTTP ${code(d1)}`, d1.status === 404));
      r.checks.push(check('req', '… liste de içermemeli', 'işaret yok', String(/F0PROBE-v1/.test(l1.body)), !/F0PROBE-v1/.test(l1.body)));
      r.checks.push(check('doc', '2. istekte yayından kaldırılan içerik gitmiş', 'HTTP 404 ve listede yok', `HTTP ${code(d2)}, listede ${/F0PROBE-v1/.test(l2.body)}`, d2.status === 404 && !/F0PROBE-v1/.test(l2.body)));
    } finally { await app.stop(); }
  });
}
