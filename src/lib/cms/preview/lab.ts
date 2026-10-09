import type { LabEntry } from '@/types';
import { validateLabInput, type LabDoc } from '../validate/lab';
import { labDocToFormValues } from '../admin/lab-form';
import { pad2 } from './common';

export interface LabPreviewModel {
  entry: LabEntry;
  /** "EXP-xx": önizlemede sıra alanından (sort_order+1) türetilir; public sitede dosya sırasından gelir. */
  expLabel: string;
  warnings: string[];
}

export function buildLabPreview(doc: LabDoc): LabPreviewModel {
  const entry: LabEntry = {
    slug: doc.slug,
    title: doc.title,
    type: doc.type,
    status: doc.experiment_status,
    summary: doc.summary,
    description: doc.description,
    tags: doc.tags,
    year: doc.year,
    accent: doc.accent,
    story: doc.story,
  };
  if (doc.short_title) entry.shortTitle = doc.short_title;
  if (doc.featured) entry.featured = true;

  const res = validateLabInput(labDocToFormValues(doc), 'publish');
  const warnings = res.ok ? [] : Object.values(res.errors).map(String);
  return { entry, expLabel: `EXP-${pad2(doc.sort_order + 1)}`, warnings };
}
