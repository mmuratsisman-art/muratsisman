import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { PREVIEW_METADATA } from '@/lib/cms/preview/metadata';

export const metadata = PREVIEW_METADATA;
export const dynamic = 'force-dynamic';

/**
 * Önizleme kabuğu: AdminShell YOK (içerik public sayfaya yakın görünsün), ama yetki kapısı aynı sunucu tarafı `requireAdmin()`.
 * ÖNEMLİ: Next.js'te layout, çocuk sayfaları korumaz (paralel çalışabilirler); bu yüzden her page de kendi `requireAdmin()` kontrolünü
 * yapar. Bu layout yalnızca oturum açmamış → /admin/login yönlendirmesini ve yetkisiz hesap mesajını sağlar.
 */
export default async function PreviewLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();
  if (session.kind === 'unconfigured') {
    return (
      <div className="shell py-16">
        <h1 className="font-display text-3xl font-extrabold">Admin yapılandırılmadı</h1>
        <p className="mt-4 max-w-xl text-muted">Supabase ortam değişkenleri tanımlı değil; önizleme kullanılamaz.</p>
      </div>
    );
  }
  if (session.kind === 'forbidden') {
    return (
      <div className="shell py-16">
        <h1 className="font-display text-3xl font-extrabold">Erişim yok</h1>
        <p className="mt-4 max-w-xl text-muted">Bu hesap admin olarak yetkilendirilmemiş.</p>
        <p className="mt-6">
          <Link href="/" className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold hover:bg-fg/5">
            Siteyi gör
          </Link>
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
