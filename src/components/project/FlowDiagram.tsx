import type { CSSProperties } from 'react';
import type { CaseDiagram } from '@/types';
import { cn } from '@/lib/cn';

interface Props {
  diagram: CaseDiagram;
  id: string;
  as?: 'h2' | 'h3';
  embedded?: boolean;
}

/**
 * Kavramsal akış şeması. HTML/CSS düğümleri + kesikli bağlantılar:
 * mobilde dikey, lg ve üstünde yatay akar (geniş SVG küçültülmez → 320px'te taşma yok).
 * Animasyon yok → prefers-reduced-motion ile zaten uyumlu.
 */
export default function FlowDiagram({ diagram, id, as: H = 'h2', embedded = false }: Props) {
  const last = diagram.steps.length - 1;

  const inner = (
    <>
      <H id={`${id}-title`} className="font-display text-[clamp(1.6rem,6vw,2.75rem)] font-extrabold leading-[0.95] tracking-tight">
        {diagram.heading}
      </H>
      <p className="mt-3 font-mono text-[11px] tracking-widest text-muted">KAVRAMSAL ŞEMA — GERÇEK ALTYAPIYI GÖSTERMEZ</p>

      <ol
        data-diagram={diagram.kind}
        className="mt-10 grid lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
        style={{ ['--n' as string]: diagram.steps.length } as CSSProperties}
      >
        {diagram.steps.map((s, i) => (
          <li key={s.label} className="relative pb-10 pl-14 last:pb-0 lg:pb-0 lg:pl-0 lg:pr-5 lg:pt-14">
            {i < last && (
              <span
                aria-hidden
                className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0 border-l-2 border-dashed border-[rgb(var(--card-accent)/.6)] lg:left-10 lg:top-[19px] lg:h-0 lg:w-[calc(100%-2.5rem)] lg:border-l-0 lg:border-t-2"
              />
            )}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border-2 font-mono text-xs font-bold',
                i === last
                  ? 'border-transparent bg-[rgb(var(--card-accent))] text-ink shadow-[0_0_30px_-4px_rgb(var(--card-accent)/.7)]'
                  : 'border-[rgb(var(--card-accent))] bg-bg text-fg',
              )}
            >
              {i + 1}
            </span>
            <p className="font-mono text-xs font-semibold uppercase leading-snug tracking-widest">{s.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-fg/80 sm:text-base">{s.caption}</p>
            {s.chips && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {s.chips.map((c) => (
                  <li key={c} className="rounded-full border border-fg/25 px-2.5 py-1 font-mono text-[11px] tracking-wider">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </>
  );

  if (embedded) {
    return <div className="shell py-10 sm:py-14">{inner}</div>;
  }

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="dot-grid relative overflow-hidden bg-surface2 py-16 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[rgb(var(--card-accent))] opacity-20" />
      <div className="shell relative">{inner}</div>
    </section>
  );
}
