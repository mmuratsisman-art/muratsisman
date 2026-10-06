import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Admin her zaman istek anında üretilir (oturum cookie'si okunur), asla statik üretilmez ve indekslenmez.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/** Admin kendi kabuğunu kullanır: public Header / Footer / navigasyon YOK. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-acid focus:px-4 focus:py-2 focus:text-ink">
        İçeriğe geç
      </a>
      <main id="main">{children}</main>
    </>
  );
}
