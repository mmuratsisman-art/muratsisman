import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminListTable from '@/components/admin/AdminListTable';
import FlashMessage from '@/components/admin/FlashMessage';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { readFlash } from '@/lib/cms/admin/flash';
import { listNotes } from '@/lib/cms/admin/notes';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export default async function AdminNotesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  // Layout korumasına ek olarak sayfa kendi başına da doğrular
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const flash = readFlash(await searchParams);
  const res = await listNotes();

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">İÇERİK</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Notlar</h1>
        <Link href="/admin/notes/new" className="rounded-full bg-acid px-6 py-3 font-semibold text-ink hover:-translate-y-0.5">
          Yeni Not
        </Link>
      </div>
      <PublicSiteNotice />
      <FlashMessage flash={flash} />
      {res.ok ? (
        <AdminListTable
          caption="Notlar"
          emptyText="Henüz not yok. “Yeni Not” ile ilk taslağı oluşturun."
          rows={res.items.map((n) => ({ id: n.id, href: `/admin/notes/${n.id}`, title: n.title, meta: `/notes/${n.slug}`, lifecycle: n.lifecycle, updatedAt: n.updatedAt }))}
        />
      ) : (
        <p role="alert" className="mt-8 rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          Notlar yüklenemedi. Lütfen sayfayı yenileyin.
        </p>
      )}
    </div>
  );
}
