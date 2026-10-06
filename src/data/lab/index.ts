import type { LabEntry } from '@/types';
import { aiToolExplorations } from './ai-tool-explorations';
import { automationPlayground } from './automation-playground';
import { webProductExperiments } from './web-product-experiments';

export { labCategories } from './categories';

/** Yeni deney eklemek: ./<slug>.ts dosyası oluştur, buraya ekle. */
export const labEntries: LabEntry[] = [aiToolExplorations, automationPlayground, webProductExperiments];

export const featuredLabEntries = (limit = 3): LabEntry[] => labEntries.filter((e) => e.featured).slice(0, limit);

export const getLabEntry = (slug: string): LabEntry | undefined => labEntries.find((e) => e.slug === slug);

/** Bir sonraki deney (sona gelince başa döner). */
export function getNextLabEntry(slug: string): LabEntry | undefined {
  const i = labEntries.findIndex((e) => e.slug === slug);
  return i === -1 ? undefined : labEntries[(i + 1) % labEntries.length];
}
