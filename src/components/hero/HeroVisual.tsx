'use client';

import { useEffect, useRef } from 'react';
import { siteConfig } from '@/data/site';
import { dotClass } from '@/lib/accent';
import type { Accent } from '@/types';

const chips: { label: string; accent: Accent; pos: string; depth: number; dur: string; delay: string }[] = [
  { label: siteConfig.hero.concepts[0], accent: 'green', pos: 'left-[2%] top-[16%]', depth: 22, dur: '6s', delay: '0s' },
  { label: siteConfig.hero.concepts[1], accent: 'blue', pos: 'right-[2%] top-[8%]', depth: -16, dur: '7s', delay: '-2s' },
  { label: siteConfig.hero.concepts[2], accent: 'purple', pos: 'right-[0%] bottom-[16%]', depth: 26, dur: '8s', delay: '-4s' },
  { label: siteConfig.hero.concepts[3], accent: 'orange', pos: 'left-[0%] bottom-[10%]', depth: -20, dur: '6.5s', delay: '-1s' },
];

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

export default function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;
    let raf = 0;
    let mx = 0, my = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx = clamp(((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2);
      my = clamp(((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 2);
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--mx', mx.toFixed(3));
        el.style.setProperty('--my', my.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={ref} className="relative mx-auto aspect-square w-full max-w-[420px] lg:max-w-[520px]" role="img" aria-label="Etkileşimli soyut görsel: yörüngelerde dönen küre">
      <div className="parallax absolute inset-[6%]" style={{ ['--d' as string]: 10 }}>
        <svg viewBox="0 0 400 400" className="h-full w-full overflow-visible" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="sphere" cx="35%" cy="30%" r="75%">
              <stop offset="0" style={{ stopColor: 'rgb(var(--blue))' }} />
              <stop offset="0.6" style={{ stopColor: 'rgb(var(--purple))' }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--sphere-edge))' }} />
            </radialGradient>
          </defs>
          <g className="animate-orbit" style={{ transformOrigin: '200px 200px' }}>
            <circle cx="200" cy="200" r="130" fill="none" stroke="rgb(var(--fg) / .28)" strokeWidth="1.5" strokeDasharray="2 7" />
            <circle cx="330" cy="200" r="10" style={{ fill: 'rgb(var(--green))' }} />
          </g>
          <g className="animate-orbit-rev" style={{ transformOrigin: '200px 200px' }}>
            <circle cx="200" cy="200" r="168" fill="none" stroke="rgb(var(--fg) / .2)" strokeWidth="1.5" />
            <circle cx="200" cy="32" r="8" style={{ fill: 'rgb(var(--orange))' }} />
          </g>
          <circle cx="200" cy="200" r="88" fill="url(#sphere)" />
          <ellipse cx="200" cy="200" rx="88" ry="30" fill="none" stroke="#fff" strokeOpacity=".28" />
          <ellipse cx="200" cy="200" rx="30" ry="88" fill="none" stroke="#fff" strokeOpacity=".28" />
          <circle cx="170" cy="168" r="14" fill="#fff" fillOpacity=".22" />
        </svg>
      </div>

      {chips.map((c) => (
        <div key={c.label} className={`parallax absolute ${c.pos}`} style={{ ['--d' as string]: c.depth }}>
          <span
            data-qa="hero-chip"
            className="flex animate-float max-md:animate-float-sm items-center gap-2 rounded-full border border-fg/20 bg-surface/90 px-3 py-1.5 font-mono text-[11px] tracking-widest shadow-sm backdrop-blur sm:text-xs"
            style={{ animationDuration: c.dur, animationDelay: c.delay }}
          >
            <span className={`h-2 w-2 rounded-full ${dotClass[c.accent]}`} aria-hidden />
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}
