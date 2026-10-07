'use server';

import { createSiteOps } from '@/lib/cms/admin/site-actions-core';
import type { FormState } from '@/lib/cms/admin/state';

const ops = createSiteOps();

export async function saveSiteContentAction(prev: FormState, formData: FormData): Promise<FormState> {
  return ops.save(prev, formData);
}
export async function discardSiteContentDraftAction(formData: FormData): Promise<void> {
  return ops.discard(formData);
}
