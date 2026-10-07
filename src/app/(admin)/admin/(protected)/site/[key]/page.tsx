import Link from 'next/link';
import { notFound } from 'next/navigation';
import FlashMessage from '@/components/admin/FlashMessage';
import LifecyclePanel from '@/components/admin/LifecyclePanel';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import SiteContentForm from '@/components/admin/SiteContentForm';
import StatusBadge from '@/components/admin/StatusBadge';
import { readFlash } from '@/lib/cms/admin/flash';
import { editorFormKey } from '@/lib/cms/admin/form-key';
import { loadSiteEditor } from '@/lib/cms/admin/site-content';
import { SITE_KEY_INFO, siteDocToFormValues } from '@/lib/cms/admin/site-form';
import { isSiteKey } from '@/lib/cms/validate/site';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { discardSiteContentDraftAction, saveSiteContentAction } from '../actions';

export default async function EditSiteContentPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const { key } = await params;
  if (!isSiteKey(key)) notFound();

  const res = await loadSiteEditor(key);
  if (!res.ok) {
    return (
      <p role="alert" className="rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
        İçerik yüklenemedi. Lütfen sayfayı yenileyin.
      </p>
    );
  }
  const { doc, lifecycle, liveUpdatedAt, expectedDraftUpdatedAt } = res.data;
  const flash = readFlash(await searchParams);
  const info = SITE_KEY_INFO[key];

  return (
    <div>
      <Link href="/admin/site" className="font-mono text-xs tracking-widest text-muted hover:text-fg">
        ← SİTE
      </Link>
      <h1 className="mt-4 break-words font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{info.label}</h1>
      <p className="mt-2 text-muted">{info.description}</p>
      <p className="mt-3">
        <StatusBadge label={lifecycle.label} tone={lifecycle.tone} />
      </p>
      <PublicSiteNotice />
      <FlashMessage flash={flash} />
      {lifecycle.key === 'empty' && <p className="mt-6 text-sm text-muted">Bu belge için henüz içerik yok. İlk taslağı kaydedin.</p>}
      {lifecycle.key === 'published-pending' && <p className="mt-6 text-sm text-muted">Bekleyen değişiklikler yalnızca taslaktadır; yayındaki sürüm “Yayınla”ya kadar değişmez.</p>}
      {/* Sunucu verisi değişince (kaydet / at / yayınla) formu yeniden bağla: kirli alanlar eski değerde KALMASIN */}
      <SiteContentForm
        key={editorFormKey({ id: key, liveUpdatedAt, draftUpdatedAt: expectedDraftUpdatedAt, lifecycleKey: lifecycle.key })}
        contentKey={key}
        action={saveSiteContentAction}
        initial={siteDocToFormValues(key, doc)}
        expectedDraftUpdatedAt={expectedDraftUpdatedAt}
        canPublish={lifecycle.canPublish}
      />
      <LifecyclePanel id={key} idFieldName="key" lifecycle={lifecycle} discardAction={discardSiteContentDraftAction} />
    </div>
  );
}
