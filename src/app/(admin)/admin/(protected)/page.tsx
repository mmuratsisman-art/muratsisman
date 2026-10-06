import Link from 'next/link';
import { adminSections } from '@/lib/cms/admin-sections';

export default function AdminHomePage() {
  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">FAZ 3A — TEMEL ALTYAPI</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Admin</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Kimlik doğrulama ve yetkilendirme sınırı çalışıyor. İçerik editörleri sonraki fazlarda eklenecek. Herkese açık site şu an
        yalnızca dosya tabanlı içerikten beslenir.
      </p>

      <h2 className="mt-10 font-mono text-xs font-normal tracking-widest text-muted">BÖLÜMLER</h2>
      <ul className="mt-3 divide-y divide-fg/15 border-y border-fg/15">
        {adminSections.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="flex flex-wrap items-baseline justify-between gap-2 py-4 transition hover:bg-fg/5">
              <span className="font-display text-xl font-bold">{s.label}</span>
              <span className="font-mono text-xs tracking-widest text-muted">
                {s.description.toUpperCase()} · FAZ {s.phase}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
