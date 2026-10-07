'use server';

import { createEntityOps } from '@/lib/cms/admin/entity-actions';
import { projectEntityConfig } from '@/lib/cms/admin/projects-config';
import type { FormState } from '@/lib/cms/admin/state';

const ops = createEntityOps(projectEntityConfig);

export async function createProjectAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.create(prev, formData);
}
export async function saveProjectAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.save(prev, formData);
}
export async function unpublishProjectAction(formData: FormData): Promise<void> {
  return ops.unpublish(formData);
}
export async function discardProjectDraftAction(formData: FormData): Promise<void> {
  return ops.discard(formData);
}
