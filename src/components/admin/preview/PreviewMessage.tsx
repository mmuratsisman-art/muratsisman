import Link from 'next/link';
import type { ReactNode } from 'react';

/** Önizleme çizilemediğinde (okuma hatası, çizilemeyen belge vb.) sayfa çökmeden gösterilen güvenli mesaj. */
export default function PreviewMessage({ title, children, backHref, backLabel }: { title: string; children?: ReactNode; backHref: string; backLabel: string }) {
  return (
    <div className="shell py-16">
      <p className="inline-block rounded-full bg-acid px-3 py-1 font-mono text-[11px] font-semibold tracking-widest text-ink">ÖNİZLEME — YAYINDA DEĞİL</p>
      <h1 className="mt-6 break-words font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-4 max-w-2xl space-y-3 text-muted">{children}</div>}
      <p className="mt-8">
        <Link href={backHref} className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold hover:bg-fg/5">
          ← {backLabel}
        </Link>
      </p>
    </div>
  );
}
