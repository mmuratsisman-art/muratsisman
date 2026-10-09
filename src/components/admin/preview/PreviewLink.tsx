import Link from 'next/link';

/**
 * Editör sayfasındaki "Önizle" bağlantısı. Yeni sekmede açılır; yalnızca KAYDEDİLMİŞ veriyi gösterir.
 * Düz bir GET bağlantısıdır (form/eylem değildir): hiçbir yazma tetiklemez.
 */
export default function PreviewLink({ href }: { href: string }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Link href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-fg/30 px-4 py-1.5 font-semibold hover:bg-fg/5">
        Önizle ↗
      </Link>
      <span className="text-muted">Son kaydedilen sürümü yeni sekmede gösterir; formdaki kaydedilmemiş değişiklikler görünmez.</span>
    </p>
  );
}
