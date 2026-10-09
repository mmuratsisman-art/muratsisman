'use client';

import Link from 'next/link';

/**
 * Public içerik okunamadığında (ör. Supabase erişilemiyor) gösterilen güvenli hata sayfası.
 * Hata ayrıntısı/yığın gösterilmez; statik içeriğe SESSİZCE DÖNÜLMEZ (yayından kaldırılmış içerik yeniden görünmesin).
 */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Şu an yüklenemiyor</h1>
      <p className="mt-4 max-w-md text-muted">İçerik geçici olarak okunamadı. Lütfen biraz sonra tekrar deneyin.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="rounded-full border border-fg/30 px-6 py-3 font-semibold hover:bg-fg/5">
          Tekrar dene
        </button>
        <Link href="/" className="rounded-full border border-fg/30 px-6 py-3 font-semibold hover:bg-fg/5">
          Ana sayfa
        </Link>
      </div>
    </div>
  );
}
