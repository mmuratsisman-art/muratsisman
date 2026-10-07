import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminListTable from '@/components/admin/AdminListTable';
import FlashMessage from '@/components/admin/FlashMessage';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { readFlash } from '@/lib/cms/admin/flash';
import { listProjects } from '@/lib/cms/admin/projects';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const flash = readFlash(await searchParams);
  const res = await listProjects();

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">İÇERİK</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Projeler</h1>
        <Link href="/admin/projects/new" className="rounded-full bg-acid px-6 py-3 font-semibold text-ink hover:-translate-y-0.5">
          Yeni Proje
        </Link>
      </div>
      <PublicSiteNotice />
      <FlashMessage flash={flash} />
      {res.ok ? (
        <AdminListTable
          caption="Projeler"
          emptyText="Henüz proje yok. “Yeni Proje” ile ilk taslağı oluşturun. (Mevcut dosya tabanlı projeler, içe aktarma yapılana kadar burada görünmez.)"
          rows={res.items.map((p) => ({
            id: p.id,
            href: `/admin/projects/${p.id}`,
            title: p.title,
            meta: `${p.comingSoon ? 'COMING SOON' : (p.kind ?? 'tür yok')} · sıra ${p.sortOrder} · /projects/${p.slug}`,
            lifecycle: p.lifecycle,
            updatedAt: p.updatedAt,
          }))}
        />
      ) : (
        <p role="alert" className="mt-8 rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          Projeler yüklenemedi. Lütfen sayfayı yenileyin.
        </p>
      )}
    </div>
  );
}
