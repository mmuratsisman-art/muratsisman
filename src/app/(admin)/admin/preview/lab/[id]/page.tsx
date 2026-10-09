import { notFound } from 'next/navigation';
import LabPreviewView from '@/components/admin/preview/LabPreviewView';
import PreviewBar from '@/components/admin/preview/PreviewBar';
import PreviewMessage from '@/components/admin/preview/PreviewMessage';
import { UUID_RE } from '@/lib/cms/admin/form';
import { loadLabEditor } from '@/lib/cms/admin/labs';
import { previewMeta } from '@/lib/cms/preview/common';
import { buildLabPreview } from '@/lib/cms/preview/lab';
import { PREVIEW_METADATA } from '@/lib/cms/preview/metadata';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export const metadata = PREVIEW_METADATA;
export const dynamic = 'force-dynamic';

/** Lab önizlemesi: SALT OKUMA (loadLabEditor → SELECT). */
export default async function LabPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const res = await loadLabEditor(id);
  if (!res.ok) {
    if (res.reason === 'not_found') notFound();
    return (
      <PreviewMessage title="Önizleme yüklenemedi" backHref="/admin/lab" backLabel="LAB">
        <p role="alert">Lab girdisi okunurken bir hata oluştu. Lütfen sayfayı yenileyin.</p>
      </PreviewMessage>
    );
  }
  const model = buildLabPreview(res.data.doc);
  return (
    <>
      <PreviewBar entityLabel="Lab girdisi" backHref={`/admin/lab/${id}`} backLabel="EDİTÖRE DÖN" meta={previewMeta(res.data)} warnings={model.warnings} />
      <LabPreviewView entry={model.entry} expLabel={model.expLabel} />
    </>
  );
}
