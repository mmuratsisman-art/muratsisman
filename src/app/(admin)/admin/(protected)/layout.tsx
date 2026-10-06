import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { signOutAction } from '@/app/(admin)/admin/actions';
import AdminShell from '@/components/admin/AdminShell';

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();

  if (session.kind === 'unconfigured') {
    return (
      <div className="shell py-16">
        <h1 className="font-display text-3xl font-extrabold">Admin yapılandırılmadı</h1>
        <p className="mt-4 max-w-xl text-muted">
          Supabase ortam değişkenleri tanımlı değil (bkz. <code>.env.example</code> ve <code>docs/cms/SETUP.md</code>). Herkese açık site bundan
          etkilenmez. Production&apos;da bu sayfa 404 döner.
        </p>
      </div>
    );
  }

  if (session.kind === 'forbidden') {
    return (
      <div className="shell py-16">
        <h1 className="font-display text-3xl font-extrabold">Erişim yok</h1>
        <p className="mt-4 max-w-xl text-muted">Bu hesap admin olarak yetkilendirilmemiş.</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <form action={signOutAction}>
            <button type="submit" className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold hover:bg-fg/5">
              Çıkış yap
            </button>
          </form>
          <Link href="/" className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold hover:bg-fg/5">
            Siteyi gör
          </Link>
        </div>
      </div>
    );
  }

  return <AdminShell email={session.email}>{children}</AdminShell>;
}
