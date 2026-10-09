import { notFound } from 'next/navigation';
import NotePreviewView from '@/components/admin/preview/NotePreviewView';
import PreviewBar from '@/components/admin/preview/PreviewBar';
import PreviewMessage from '@/components/admin/preview/PreviewMessage';
import { UUID_RE } from '@/lib/cms/admin/form';
import { loadNoteEditor } from '@/lib/cms/admin/notes';
import { previewMeta } from '@/lib/cms/preview/common';
import { PREVIEW_METADATA } from '@/lib/cms/preview/metadata';
import { buildNotePreview } from '@/lib/cms/preview/notes';
import { requireAdmin } from '@/lib/supabase/admin-auth';

export const metadata = PREVIEW_METADATA;
export const dynamic = 'force-dynamic';

/** Not önizlemesi: SALT OKUMA (loadNoteEditor → SELECT). */
export default async function NotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const res = await loadNoteEditor(id);
  if (!res.ok) {
    if (res.reason === 'not_found') notFound();
    return (
      <PreviewMessage title="Önizleme yüklenemedi" backHref="/admin/notes" backLabel="NOTLAR">
        <p role="alert">Not okunurken bir hata oluştu. Lütfen sayfayı yenileyin.</p>
      </PreviewMessage>
    );
  }
  const model = buildNotePreview(res.data.doc);
  return (
    <>
      <PreviewBar entityLabel="Not" backHref={`/admin/notes/${id}`} backLabel="EDİTÖRE DÖN" meta={previewMeta(res.data)} warnings={model.warnings} />
      <NotePreviewView note={model.note} hasDate={model.hasDate} readingMinutes={model.readingMinutes} />
    </>
  );
}
