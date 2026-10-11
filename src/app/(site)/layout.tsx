import type { ReactNode } from 'react';
import HitBeacon from '@/components/analytics/HitBeacon';
import SiteChrome from '@/components/layout/SiteChrome';

/** Herkese açık sayfaların kabuğu. URL'e yansımaz: /, /projects/*, /lab/*, /notes/* aynı kalır. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  // Ziyaretçi sayacı: yalnızca derleme zamanında NEXT_PUBLIC_ANALYTICS_BEACON=1 ise yüklenir (varsayılan KAPALI). Admin bu layout'u kullanmaz.
  return (
    <SiteChrome>
      {children}
      {process.env.NEXT_PUBLIC_ANALYTICS_BEACON === '1' && <HitBeacon />}
    </SiteChrome>
  );
}
