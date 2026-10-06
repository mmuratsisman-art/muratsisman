import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminListTable from '@/components/admin/AdminListTable';
import FlashMessage from '@/components/admin/FlashMessage';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { readFlash } from '@/lib/cms/admin/flash';
import { listLabEntries } from '@/lib/cms/admin/labs';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export default async function AdminLabPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const flash = readFlash(await searchParams);
  const res = await listLabEntries();

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">İÇERİK</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Lab</h1>
        <Link href="/admin/lab/new" className="rounded-full bg-acid px-6 py-3 font-semibold text-ink hover:-translate-y-0.5">
          Yeni Deney
        </Link>
      </div>
      <PublicSiteNotice />
      <FlashMessage flash={flash} />
      {res.ok ? (
        <AdminListTable
          caption="Lab deneyleri"
          emptyText="Henüz deney yok. “Yeni Deney” ile ilk taslağı oluşturun."
          rows={res.items.map((e) => ({
            id: e.id,
            href: `/admin/lab/${e.id}`,
            title: e.title,
            meta: `${e.type} · sıra ${e.sortOrder} · /lab/${e.slug}`,
            lifecycle: e.lifecycle,
            updatedAt: e.updatedAt,
          }))}
        />
      ) : (
        <p role="alert" className="mt-8 rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          Deneyler yüklenemedi. Lütfen sayfayı yenileyin.
        </p>
      )}
    </div>
  );
}
