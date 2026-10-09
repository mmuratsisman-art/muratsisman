import Link from 'next/link';
import { ArrowDownRight } from 'lucide-react';
import { getSiteContent } from '@/lib/content';
import HeroVisual from './HeroVisual';
import ScrollDock from './ScrollDock';

export default async function Hero() {
  const { hero } = (await getSiteContent()).siteConfig;
  return (
    <section id="top" aria-labelledby="hero-title" className="dot-grid relative overflow-hidden bg-hero">
      <ScrollDock />
      <div className="shell grid min-h-[calc(100svh-4rem)] items-center gap-12 py-12 sm:py-16 md:gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="animate-rise">
          <p className="mb-5 font-mono text-xs tracking-widest text-muted">{hero.eyebrow}</p>

          <h1 id="hero-title" className="hero-title font-display text-[clamp(3.25rem,14.5vw,9rem)] font-extrabold leading-[0.85] tracking-tighter">
            <span className="block">{hero.first}</span>
            <span className="block">{hero.last}</span>
          </h1>

          <p className="mt-6 font-mono text-[11px] leading-relaxed tracking-[0.18em] text-muted sm:text-sm">{hero.roles}</p>

          <p className="mt-8 max-w-xl font-display text-2xl font-bold leading-tight sm:text-3xl">
            {hero.message.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link data-qa="hero-cta" href={hero.ctaPrimary.href} className="inline-flex items-center gap-2 rounded-full bg-acid px-4 py-3.5 min-[400px]:px-6 font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-10px_rgb(var(--green)/.8)]">
              {hero.ctaPrimary.label}
              <ArrowDownRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link data-qa="hero-cta" href={hero.ctaSecondary.href} className="inline-flex items-center rounded-full border border-fg/30 px-4 py-3.5 min-[400px]:px-6 font-semibold transition hover:border-fg hover:bg-fg/5">
              {hero.ctaSecondary.label}
            </Link>
          </div>
        </div>

        <HeroVisual concepts={hero.concepts} />
      </div>
    </section>
  );
}
