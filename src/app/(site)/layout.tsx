import type { ReactNode } from 'react';
import SiteChrome from '@/components/layout/SiteChrome';

/** Herkese açık sayfaların kabuğu. URL'e yansımaz: /, /projects/*, /lab/*, /notes/* aynı kalır. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
