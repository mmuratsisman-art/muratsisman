'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { navigation } from '@/data/navigation';
import { siteConfig } from '@/data/site';
import { cn } from '@/lib/cn';
import ThemeToggle from './ThemeToggle';

const inSection = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Ayrı sayfası olan bölümler: /lab, /lab/* → Lab; /notes, /notes/* → Notlar. */
const routeSection = (pathname: string) => (inSection(pathname, '/lab') ? 'lab' : inSection(pathname, '/notes') ? 'notes' : null);

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('top');

  // Ana sayfadaki bölüm takibi. Header layout'ta kalıcı olduğu için route değişince yeniden kurulur.
  useEffect(() => {
    setActive('top');
    const els = navigation.map((n) => document.getElementById(n.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = routeSection(pathname) ?? active;
  const { left, right } = siteConfig.brand;

  return (
    <header className="sticky top-0 z-50 border-b border-fg/10 bg-bg/80 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between">
        <Link href="/" aria-label={`${left}/${right} ana sayfa`} className="relative font-display text-xl font-extrabold tracking-tight">
          {left}<span className="text-electric">/</span>{right}
          {/* Hero başlığı logoya "dock" olunca vurgulanır (--dock: 0 | 1) */}
          <span
            aria-hidden
            className="absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-acid transition-transform duration-300"
            style={{ transform: 'scaleX(var(--dock, 0))' }}
          />
        </Link>

        <nav aria-label="Ana menü" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {navigation.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={current === item.id ? 'true' : undefined}
                  className={cn(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition',
                    current === item.id ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-fg/20 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Mobil menü" className="border-t border-fg/10 bg-bg lg:hidden">
          <ul className="shell flex flex-col py-4">
            {navigation.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between border-b border-fg/10 py-4 font-display text-3xl font-bold"
                >
                  {item.label}
                  <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', current === item.id ? 'bg-acid' : 'bg-fg/20')} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
