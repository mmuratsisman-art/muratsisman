'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminSections } from '@/lib/cms/admin-sections';
import { cn } from '@/lib/cn';

export default function AdminNav() {
  const pathname = usePathname();
  const items = [{ href: '/admin', label: 'Genel bakış' }, ...adminSections.map((s) => ({ href: s.href, label: s.label }))];

  return (
    <nav aria-label="Admin bölümleri">
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-full px-4 py-2 text-sm font-medium transition lg:rounded-xl',
                  active ? 'bg-fg text-bg' : 'text-muted hover:bg-fg/5 hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
