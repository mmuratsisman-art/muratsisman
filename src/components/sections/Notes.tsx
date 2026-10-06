import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { latestNotes } from '@/data/notes';
import SectionHeading from '@/components/ui/SectionHeading';
import NoteRow from '@/components/notes/NoteRow';

export default function Notes() {
  return (
    <section id="notes" aria-labelledby="notes-title" className="bg-bg py-20 sm:py-28">
      <div className="shell">
        <SectionHeading id="notes-title" title="NOTES" />
        <ul className="divide-y divide-fg/15 border-y border-fg/15">
          {latestNotes(3).map((n) => (
            <NoteRow key={n.slug} note={n} variant="compact" as="h3" />
          ))}
        </ul>
        <Link
          href="/notes"
          className="mt-10 inline-flex items-center gap-2 rounded-full border border-fg/30 px-6 py-3.5 font-semibold transition hover:border-fg hover:bg-fg/5"
        >
          Tüm notlar
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
