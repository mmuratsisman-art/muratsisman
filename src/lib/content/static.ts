import { currently } from '@/data/currently';
import { labCategories, labEntries } from '@/data/lab';
import { notes } from '@/data/notes';
import { projects } from '@/data/projects';
import { siteConfig } from '@/data/site';
import { socialLinks } from '@/data/social';
import type { StaticContent } from './provider';

/** Mevcut dosya tabanlı içerik (değiştirilmemiş src/data/* modülleri). */
export const staticContent: StaticContent = {
  projects,
  labEntries,
  notes,
  site: { siteConfig, currently, socialLinks, labCategories },
};
