import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Admin her zaman istek anında üretilir (oturum cookie'si okunur), asla statik üretilmez ve indekslenmez.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
