'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { browserOptedOut } from '@/lib/analytics/guard';
import { normalizePagePath, normalizeShowcaseSlug } from '@/lib/analytics/paths';

/**
 * Public sayfa görüntüleme + Showcase tıklama beacon'ı. YALNIZCA (site) layout'unda ve YALNIZCA derleme zamanında
 * NEXT_PUBLIC_ANALYTICS_BEACON=1 iken render edilir (admin ve önizleme sayılmaz). Görünür bir çıktısı yoktur.
 *  - Çerez, localStorage, sessionStorage, parmak izi YOK.
 *  - Do Not Track / Global Privacy Control bildiren tarayıcıda HİÇBİR ŞEY gönderilmez.
 *  - Sayfa yüklendikten sonra (boşta) ve `keepalive` ile, kimlik bilgisi (credentials) OLMADAN gönderilir; hata sessizce yutulur.
 */
type Nav = { doNotTrack?: string | null; globalPrivacyControl?: boolean };

function send(body: { k: 'p' | 's'; p: string }): void {
  try {
    void fetch('/api/hit', {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // yoksay
  }
}

const optedOut = (): boolean => browserOptedOut(navigator as unknown as Nav, window as unknown as { doNotTrack?: string | null });

export default function HitBeacon() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const path = normalizePagePath(pathname);
    if (!path || last.current === path || optedOut()) return;
    last.current = path;
    const run = () => send({ k: 'p', p: path });
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1500);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return; // sağ tık (bağlantıyı kopyalama) sayılmaz
      const a = (e.target as Element | null)?.closest?.('a[data-showcase-slug]');
      const slug = normalizeShowcaseSlug(a?.getAttribute('data-showcase-slug'));
      if (!slug || optedOut()) return;
      send({ k: 's', p: slug });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('auxclick', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('auxclick', onClick);
    };
  }, []);

  return null;
}
