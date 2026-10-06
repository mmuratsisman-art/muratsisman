import type { NoteBlock } from '@/types';

/** Okuma odaklı gövde: ~40rem satır uzunluğu, rahat satır aralığı. */
export default function NoteBody({ blocks }: { blocks: NoteBlock[] }) {
  return (
    <div>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return (
              <h2 key={i} className="mt-12 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {b.text}
              </h2>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="mt-10 border-l-4 border-[rgb(var(--card-accent))] pl-5 font-display text-2xl font-bold leading-snug sm:text-3xl"
              >
                {b.text}
              </blockquote>
            );
          case 'list':
            return (
              <ul key={i} className="mt-6 space-y-3 text-lg leading-[1.7] sm:text-[1.1875rem]">
                {b.items.map((it) => (
                  <li key={it} className="relative pl-7">
                    <span aria-hidden className="absolute left-0 top-[0.8em] h-2 w-2 -translate-y-1/2 bg-[rgb(var(--card-accent))]" />
                    {it}
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className="mt-6 text-lg leading-[1.75] text-fg/90 first:mt-0 sm:text-[1.1875rem]">
                {b.text}
              </p>
            );
        }
      })}
    </div>
  );
}
