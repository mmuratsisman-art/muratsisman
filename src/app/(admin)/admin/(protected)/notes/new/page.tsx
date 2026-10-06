import Link from 'next/link';
import { notFound } from 'next/navigation';
import NoteForm from '@/components/admin/NoteForm';
import PublicSiteNotice from '@/components/admin/PublicSiteNotice';
import { emptyNoteDoc, noteDocToFormValues } from '@/lib/cms/admin/note-form';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { createNoteAction } from '../actions';

export default async function NewNotePage() {
  if ((await requireAdmin()).kind !== 'admin') notFound();
  return (
    <div>
      <Link href="/admin/notes" className="font-mono text-xs tracking-widest text-muted hover:text-fg">
        ← NOTLAR
      </Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Yeni Not</h1>
      <PublicSiteNotice />
      <NoteForm mode="create" action={createNoteAction} initial={noteDocToFormValues(emptyNoteDoc())} />
    </div>
  );
}
