import type { Metadata } from 'next';
import { getNotes, getSiteContent } from '@/lib/content';
import { ensureDynamicIfCms } from '@/lib/content/dynamic';
import NoteRow from '@/components/notes/NoteRow';

export const metadata: Metadata = {
  title: 'NOTES · Notlar ve Gözlemler',
  description: 'MURAT/LAB notları: yapay zekâ, altyapı, web ürünleri ve otomasyon üzerine kısa gözlemler, dersler ve fikirler.',
  alternates: { canonical: '/notes' },
};

export default async function NotesPage() {
  await ensureDynamicIfCms();
  const [notes, { siteConfig }] = await Promise.all([getNotes(), getSiteContent()]);
  return (
    <div className="bg-bg">
      <header className="shell pb-10 pt-14 sm:pb-14 sm:pt-24">
        <p className="font-mono text-xs tracking-widest text-muted">{siteConfig.notesPage.eyebrow}</p>
        <h1 className="mt-4 font-display text-[clamp(3.25rem,16vw,11rem)] font-extrabold leading-[0.85] tracking-tighter">NOTES</h1>
        <p className="mt-8 max-w-xl text-xl leading-snug text-muted sm:text-2xl">
          {siteConfig.notesPage.intro}
        </p>
      </header>

      <section aria-label="Tüm notlar" className="pb-20 sm:pb-28">
        <div className="shell">
          <ul className="divide-y divide-fg/15 border-y border-fg/15">
            {notes.map((n, i) => (
              <NoteRow key={n.slug} note={n} first={i === 0} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
