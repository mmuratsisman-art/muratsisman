import type { ReactNode } from 'react';
import { signOutAction } from '@/app/admin/actions';
import AdminNav from './AdminNav';

export default function AdminShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <div className="bg-bg">
      <div className="shell py-10 sm:py-14">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-fg/15 pb-6">
          <div>
            <p className="font-mono text-xs tracking-widest text-muted">MURAT/LAB — ADMIN</p>
            {email && <p className="mt-1 text-sm text-muted">{email}</p>}
          </div>
          <form action={signOutAction}>
            <button type="submit" className="rounded-full border border-fg/30 px-5 py-2 text-sm font-semibold transition hover:border-fg hover:bg-fg/5">
              Çıkış yap
            </button>
          </form>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
          <AdminNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
