import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import { getChromeIdentity } from '@/lib/content';

/**
 * Herkese açık site kabuğu: skip-link + Header + <main id="main"> + Footer.
 * (site)/layout.tsx ve kök not-found.tsx tarafından kullanılır; admin bunu KULLANMAZ.
 */
export default async function SiteChrome({ children }: { children: ReactNode }) {
  const id = await getChromeIdentity();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-acid focus:px-4 focus:py-2 focus:text-ink">
        İçeriğe geç
      </a>
      <Header brand={id.brand} />
      <main id="main">{children}</main>
      <Footer name={id.name} domain={id.domain} />
    </>
  );
}
