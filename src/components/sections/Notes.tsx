import { notes } from '@/data/notes';
import { dotClass } from '@/lib/accent';
import SectionHeading from '@/components/ui/SectionHeading';

// FAZ 2: dinamik içerik (MDX/CMS) ve /notes/[slug] sayfaları.
export default function Notes() {
  return (
    <section id="notes" aria-labelledby="notes-title" className="bg-bg py-20 sm:py-28">
      <div className="shell">
        <SectionHeading id="notes-title" title="NOTES" />
        <ul className="divide-y divide-fg/15 border-y border-fg/15">
          {notes.map((n) => (
            <li key={n.slug} className="flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-display text-2xl font-bold leading-tight sm:max-w-2xl sm:text-3xl">{n.title}</h3>
              <span className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted">
                <span className={`h-2 w-2 rounded-full ${dotClass[n.accent]}`} aria-hidden />
                {n.category} · YAKINDA
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
