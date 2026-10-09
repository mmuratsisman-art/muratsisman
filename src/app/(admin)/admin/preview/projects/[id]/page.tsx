import { notFound } from 'next/navigation';
import { ComingSoonPreview, CaseStudyPreview } from '@/components/admin/preview/ProjectPreviewView';
import PreviewBar from '@/components/admin/preview/PreviewBar';
import PreviewMessage from '@/components/admin/preview/PreviewMessage';
import { UUID_RE } from '@/lib/cms/admin/form';
import { loadProjectEditor } from '@/lib/cms/admin/projects';
import { PREVIEW_METADATA } from '@/lib/cms/preview/metadata';
import { previewMeta } from '@/lib/cms/preview/common';
import { buildProjectPreview } from '@/lib/cms/preview/project';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export const metadata = PREVIEW_METADATA;
export const dynamic = 'force-dynamic';

/** Proje önizlemesi: SALT OKUMA (yalnızca loadProjectEditor → SELECT). Yazma / RPC / publish yok. */
export default async function ProjectPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound(); // layout çocukları korumaz: kontrol burada da zorunlu
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const back = `/admin/projects/${id}`;

  const res = await loadProjectEditor(id);
  if (!res.ok) {
    if (res.reason === 'not_found') notFound();
    return (
      <PreviewMessage title="Önizleme yüklenemedi" backHref="/admin/projects" backLabel="PROJELER">
        <p role="alert">Proje okunurken bir hata oluştu. Lütfen sayfayı yenileyin.</p>
      </PreviewMessage>
    );
  }

  const meta = previewMeta(res.data);
  const model = buildProjectPreview(res.data.doc);

  return (
    <>
      <PreviewBar entityLabel="Proje" backHref={back} backLabel="EDİTÖRE DÖN" meta={meta} warnings={model.warnings} />
      {model.kind === 'case-study' && <CaseStudyPreview project={model.project} />}
      {model.kind === 'coming-soon' && <ComingSoonPreview project={model.project} />}
      {model.kind === 'unrenderable' && (
        <PreviewMessage title={model.project.title || '(başlıksız)'} backHref={back} backLabel="EDİTÖRE DÖN">
          {model.problems.map((p, i) => (
            <p key={i} role="alert">{p}</p>
          ))}
        </PreviewMessage>
      )}
    </>
  );
}
