import { PROBE, setTitle, mark } from '../fake-supabase/fixtures';
import { info } from '../lib/types';
import { code, fresh, get, guarded, noteUrl, verOf, type Ctx } from './common';

/** M09: `next start` yeniden başlatılınca disk üzerindeki veri önbelleği kullanılıyor mu (yerel analog; Vercel'i KANITLAMAZ). */
export async function m09(ctx: Ctx) {
  return guarded('M09', 'Yeniden başlatma sonrası disk önbelleği (yerel)', async (r) => {
    fresh(ctx);
    const a = await ctx.start('m09-a');
    try {
      const w = await get(noteUrl(a));
      r.checks.push(info('A süreci: ısınma', `HTTP ${code(w)} ${verOf(w)}`));
    } finally { await a.stop(); }
    setTitle(ctx.fake.world, 'notes', PROBE.noteSlug, mark('v2'));
    const b = await ctx.start('m09-b', { keepCache: true });
    try {
      const sq = ctx.fake.lastSeq();
      const res = await get(noteUrl(b));
      const dq = ctx.fake.countSince(sq);
      r.checks.push(info('B süreci (cache dizini korunarak yeniden başlatıldı, TTL dolmadan): ilk istek', `${verOf(res) ?? code(res)}; DB isteği ${dq}`));
      r.observations.push(verOf(res) === 'v1' ? 'Gözlem: disk veri önbelleği süreç yeniden başlatmasından sağ çıkıyor (v1 sunuldu). Vercel’de Data Cache davranışı AYRI olarak (F4) doğrulanmalı.' : 'Gözlem: önbellek yeniden başlatmadan sonra kullanılmadı (v2 okundu).');
    } finally { await b.stop(); }
  });
}
