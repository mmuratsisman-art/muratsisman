import { notFound } from 'next/navigation';
import AdminListTable from '@/components/admin/AdminListTable';
import FlashMessage from '@/components/admin/FlashMessage';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { readFlash } from '@/lib/cms/admin/flash';
import { SITE_KEY_INFO } from '@/lib/cms/admin/site-form';
import { listSiteContent } from '@/lib/cms/admin/site-content';
import { FRIENDLY_SITE_KEYS, isFriendlyKey } from '@/lib/cms/validate/site';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export default async function AdminSitePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const flash = readFlash(await searchParams);
  const res = await listSiteContent();

  const rows = res.ok
    ? res.items.map((i) => ({
        id: i.key,
        href: `/admin/site/${i.key}`,
        title: SITE_KEY_INFO[i.key].label,
        meta: `${isFriendlyKey(i.key) ? 'FORM' : 'JSON'} · ${SITE_KEY_INFO[i.key].description}`,
        lifecycle: i.lifecycle,
        updatedAt: i.updatedAt,
      }))
    : [];

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-muted">İÇERİK</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Site</h1>
      <PublicSiteNotice />
      <FlashMessage flash={flash} />
      <p className="mt-6 max-w-2xl text-sm text-muted">
        {FRIENDLY_SITE_KEYS.length} belge kullanıcı dostu formla, kalan {rows.length ? rows.length - FRIENDLY_SITE_KEYS.length : 6} belge doğrulanmış JSON editörüyle yönetilir. Belgeler
        kaldırılamaz; yalnızca düzenlenip yayınlanır. Henüz içeriği olmayan belgeler “BOŞ” görünür (dosya tabanlı içerik buraya otomatik taşınmaz).
      </p>
      {res.ok ? (
        <AdminListTable caption="Site içeriği belgeleri" emptyText="Belge bulunamadı." rows={rows} />
      ) : (
        <p role="alert" className="mt-8 rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
          Site içeriği yüklenemedi. Lütfen sayfayı yenileyin.
        </p>
      )}
    </div>
  );
}
