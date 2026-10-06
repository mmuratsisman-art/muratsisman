import type { CaseSectionData } from '@/types';
import { cn } from '@/lib/cn';

const pad = (n: number) => String(n).padStart(2, '0');

export default function SectionBody({ section }: { section: CaseSectionData }) {
  if (section.kind === 'prose') {
    return (
      <div className="max-w-2xl space-y-5">
        {section.body.map((p, i) => (
          <p
            key={i}
            className={i === 0 ? 'text-xl font-medium leading-snug sm:text-2xl' : 'text-base leading-relaxed text-fg/80 sm:text-lg'}
          >
            {p}
          </p>
        ))}
      </div>
    );
  }

  if (section.variant === 'numbered') {
    return (
      <ol className="divide-y divide-fg/15 border-y border-fg/15">
        {section.items.map((it, i) => (
          <li key={it.title} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-4 py-6 sm:grid-cols-[5rem_minmax(0,1fr)]">
            <span
              aria-hidden
              className="font-display text-5xl font-extrabold leading-none text-transparent sm:text-6xl [-webkit-text-stroke:1.5px_rgb(var(--fg))]"
            >
              {pad(i + 1)}
            </span>
            <div>
              <h3 className="font-display text-xl font-bold leading-tight sm:text-2xl">{it.title}</h3>
              <p className="mt-2 text-fg/80">{it.text}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {section.items.map((it, i) => (
        <li key={it.title} className={cn('border-t-2 border-fg/25 pt-4', i % 2 === 1 && 'sm:mt-10')}>
          <p aria-hidden className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted">
            <span className="h-2 w-2 rounded-full bg-[rgb(var(--card-accent))]" />
            {pad(i + 1)}
          </p>
          <h3 className="mt-2 font-display text-xl font-bold leading-tight">{it.title}</h3>
          <p className="mt-2 text-fg/80">{it.text}</p>
        </li>
      ))}
    </ul>
  );
}
