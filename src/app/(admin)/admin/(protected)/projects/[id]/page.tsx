import Link from 'next/link';
import { notFound } from 'next/navigation';
import FlashMessage from '@/components/admin/FlashMessage';
import LifecyclePanel from '@/components/admin/LifecyclePanel';
import ProjectForm from '@/components/admin/ProjectForm';
import PreviewLink from '@/components/admin/preview/PreviewLink';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import StatusBadge from '@/components/admin/StatusBadge';
import { readFlash } from '@/lib/cms/admin/flash';
import { editorFormKey } from '@/lib/cms/admin/form-key';
import { UUID_RE } from '@/lib/cms/admin/form';
import { projectDocToFormValues } from '@/lib/cms/admin/project-form';
import { loadProjectEditor } from '@/lib/cms/admin/projects';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { discardProjectDraftAction, saveProjectAction, unpublishProjectAction } from '../actions';

export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const res = await loadProjectEditor(id);
  if (!res.ok) {
    if (res.reason === 'not_found') notFound();
    return (
      <p role="alert" className="rounded-xl border border-hot px-4 py-3 text-sm font-semibold">
        Proje yüklenemedi. Lütfen sayfayı yenileyin.
      </p>
    );
  }
  const { doc, lifecycle, stale, liveUpdatedAt, expectedDraftUpdatedAt } = res.data;
  const flash = readFlash(await searchParams);

  return (
    <div>
      <Link href="/admin/projects" className="font-mono text-xs tracking-widest text-muted hover:text-fg">
        ← PROJELER
      </Link>
      <h1 className="mt-4 break-words font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{doc.title || '(başlıksız)'}</h1>
      <p className="mt-3">
        <StatusBadge label={lifecycle.label} tone={lifecycle.tone} />
      </p>
      <PreviewLink href={`/admin/preview/projects/${id}`} />
      <PublicSiteNotice />
      <FlashMessage flash={flash} />
      {stale && (
        <p role="alert" className="mt-6 rounded-xl border border-hot px-4 py-3 text-sm">
          Bu taslak, yayındaki sürüm sonradan değiştiği için eski bir sürüme dayanıyor ve <strong>yayınlanamaz</strong>. Taslağı atıp yeniden
          başlayın (gerekirse içeriği önce kopyalayın).
        </p>
      )}
      {lifecycle.key === 'published-pending' && !stale && (
        <p className="mt-6 text-sm text-muted">Bekleyen değişiklikler yalnızca taslaktadır; yayındaki sürüm “Yayınla”ya kadar değişmez.</p>
      )}
      {/* Sunucu verisi değişince (kaydet / at / yayınla / kaldır) formu yeniden bağla: kirli alanlar eski değerde KALMASIN */}
      <ProjectForm
        key={editorFormKey({ id, liveUpdatedAt, draftUpdatedAt: expectedDraftUpdatedAt, lifecycleKey: lifecycle.key })}
        mode="edit"
        action={saveProjectAction}
        id={id}
        initial={projectDocToFormValues(doc)}
        expectedDraftUpdatedAt={expectedDraftUpdatedAt}
        slugLocked={lifecycle.slugLocked}
        canPublish={lifecycle.canPublish}
      />
      <LifecyclePanel id={id} lifecycle={lifecycle} unpublishAction={unpublishProjectAction} discardAction={discardProjectDraftAction} />
    </div>
  );
}
