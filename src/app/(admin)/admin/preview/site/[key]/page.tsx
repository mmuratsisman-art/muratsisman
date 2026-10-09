import { notFound } from 'next/navigation';
import PreviewBar from '@/components/admin/preview/PreviewBar';
import PreviewMessage from '@/components/admin/preview/PreviewMessage';
import SiteDocView from '@/components/admin/preview/SiteDocView';
import { loadSiteEditor } from '@/lib/cms/admin/site-content';
import { SITE_KEY_INFO } from '@/lib/cms/admin/site-form';
import { PREVIEW_METADATA } from '@/lib/cms/preview/metadata';
import { buildSitePreview } from '@/lib/cms/preview/site';
import { isSiteKey } from '@/lib/cms/validate/site';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export const metadata = PREVIEW_METADATA;
export const dynamic = 'force-dynamic';

/**
 * Site belgesi önizlemesi: SALT OKUMA (loadSiteEditor → SELECT). Bu bir BELGE önizlemesidir; ana sayfanın veya sitenin
 * gerçek önizlemesi DEĞİLDİR (tek bir belge tam sayfa olarak güvenle bağlama oturtulamaz).
 */
export default async function SitePreviewPage({ params }: { params: Promise<{ key: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const { key } = await params;
  if (!isSiteKey(key)) notFound();
  const back = `/admin/site/${key}`;

  const res = await loadSiteEditor(key);
  if (!res.ok) {
    return (
      <PreviewMessage title="Önizleme yüklenemedi" backHref="/admin/site" backLabel="SİTE">
        <p role="alert">Belge okunurken bir hata oluştu. Lütfen sayfayı yenileyin.</p>
      </PreviewMessage>
    );
  }
  const info = SITE_KEY_INFO[key];
  const { lifecycle, expectedDraftUpdatedAt, doc } = res.data;
  const model = buildSitePreview(key, doc);
  const meta = { source: expectedDraftUpdatedAt !== '' ? ('draft' as const) : ('live' as const), stale: false, lifecycleLabel: lifecycle.label };

  return (
    <>
      <PreviewBar
        entityLabel="Site belgesi"
        backHref={back}
        backLabel="EDİTÖRE DÖN"
        meta={meta}
        warnings={model.kind === 'doc' && model.problem ? [`Belge doğrulaması: ${model.problem}`] : []}
      />
      <div className="shell py-12 sm:py-16">
        <p className="font-mono text-xs tracking-widest text-muted">SİTE BELGESİ · {key}</p>
        <h1 className="mt-3 break-words font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{info.label}</h1>
        <p className="mt-2 text-muted">{info.description}</p>
        <p className="mt-4 max-w-2xl rounded-xl border border-dashed border-fg/25 px-4 py-3 text-sm text-muted">
          Bu, belgenin okunabilir bir önizlemesidir; <strong>ana sayfanın veya sitenin gerçek önizlemesi değildir</strong>.
        </p>
        <div className="mt-8">
          {model.kind === 'empty' ? (
            <p className="text-muted">Bu belge için henüz içerik yok.</p>
          ) : (
            <SiteDocView node={model.node} />
          )}
        </div>
      </div>
    </>
  );
}
