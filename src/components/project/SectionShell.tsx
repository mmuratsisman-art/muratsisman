import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  id: string;
  heading: string;
  num?: string;
  tone?: 'base' | 'alt' | 'plain';
  as?: 'h2' | 'h3';
  children: ReactNode;
}

const toneClass = {
  base: 'bg-bg py-14 sm:py-20',
  alt: 'bg-projects py-14 sm:py-20',
  plain: 'py-8 sm:py-10',
};

/** Editorial iki kolon: solda sticky başlık, sağda içerik. Kart değil, boşluk ve tipografi. */
export default function SectionShell({ id, heading, num, tone = 'base', as: H = 'h2', children }: Props) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={toneClass[tone]}>
      <div className="shell grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
        <header className="lg:sticky lg:top-24 lg:self-start">
          {num && (
            <p aria-hidden className="font-mono text-xs tracking-widest text-muted">
              {num}
            </p>
          )}
          <H
            id={`${id}-title`}
            className={cn(
              'mt-2 font-display font-extrabold leading-[0.95] tracking-tight',
              H === 'h2' ? 'text-[clamp(1.6rem,6vw,2.75rem)]' : 'text-[clamp(1.35rem,5vw,2rem)]',
            )}
          >
            {heading}
          </H>
          <span aria-hidden className="mt-4 block h-1 w-12 rounded-full bg-[rgb(var(--card-accent))]" />
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
