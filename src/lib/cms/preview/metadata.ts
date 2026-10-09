import type { Metadata } from 'next';

/** Önizleme sayfaları ASLA indekslenmez ve önbelleğe alınmaz. Layout VE her page bu sabiti dışa aktarır. */
export const PREVIEW_METADATA: Metadata = {
  title: 'Önizleme',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
};
