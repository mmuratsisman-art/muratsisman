'use server';

import { createEntityOps } from '@/lib/cms/admin/entity-actions';
import { labEntityConfig } from '@/lib/cms/admin/labs-config';
import type { FormState } from '@/lib/cms/admin/state';

const ops = createEntityOps(labEntityConfig);

export async function createLabEntryAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.create(prev, formData);
}
export async function saveLabEntryAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.save(prev, formData);
}
export async function unpublishLabEntryAction(formData: FormData): Promise<void> {
  return ops.unpublish(formData);
}
export async function discardLabEntryDraftAction(formData: FormData): Promise<void> {
  return ops.discard(formData);
}
