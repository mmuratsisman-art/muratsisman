'use client';

import { useEffect } from 'react';

/**
 * Scroll ilerlemesini (--p: 0..1) ve "dock" durumunu (--dock: 0|1) <html> üzerine yazar.
 * Native scroll'a dokunmaz; sadece pasif dinleyici + rAF. Reduced motion'da kapalı.
 */
export default function ScrollDock({ range = 0.6 }: { range?: number }) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;

    const update = () => {
      raf = 0;
      if (mq.matches) { root.style.setProperty('--p', '0'); root.style.setProperty('--dock', '0'); return; }
      const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * range)));
      root.style.setProperty('--p', p.toFixed(3));
      root.style.setProperty('--dock', p > 0.85 ? '1' : '0');
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
      root.style.removeProperty('--p');
      root.style.removeProperty('--dock');
    };
  }, [range]);

  return null;
}
