'use server';

import { createEntityOps } from '@/lib/cms/admin/entity-actions';
import { noteEntityConfig } from '@/lib/cms/admin/notes-config';
import type { FormState } from '@/lib/cms/admin/state';

const ops = createEntityOps(noteEntityConfig);

export async function createNoteAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.create(prev, formData);
}
export async function saveNoteAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.save(prev, formData);
}
export async function unpublishNoteAction(formData: FormData): Promise<void> {
  return ops.unpublish(formData);
}
export async function discardNoteDraftAction(formData: FormData): Promise<void> {
  return ops.discard(formData);
}
