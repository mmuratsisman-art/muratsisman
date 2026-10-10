import type { Metadata } from 'next';

/** Paylaşım kartı üst verisi (Open Graph + Twitter). Görsel YOK: kart türü `summary` (görsel gerektirmez). */
export const SITE_NAME = 'MURAT/LAB'; // layout.tsx `title.template` ile aynı sabit
const OG_LOCALE = 'tr_TR';

export interface SocialInput {
  /** Sayfanın mevcut başlığı (site adı eki OLMADAN); sayfanın `title`/`description` değerleriyle AYNI olmalı. */
  title: string;
  description: string;
  /** Verilirse sayfa `article` olur (ISO tarih, YYYY-MM-DD). */
  publishedTime?: string;
}

/**
 * Next, bir sayfanın `openGraph`/`twitter` nesnesini kökten DEVRALMAZ, TAMAMEN değiştirir; bu yüzden her indekslenebilir sayfa
 * kendi başlık/açıklamasıyla bu yardımcıyı çağırır. `og:url` bilerek yazılmaz: kanonik adres `alternates.canonical`'dır.
 */
export function socialMetadata(i: SocialInput): { openGraph: NonNullable<Metadata['openGraph']>; twitter: NonNullable<Metadata['twitter']> } {
  const twitter = { card: 'summary', title: i.title, description: i.description } as const;
  if (i.publishedTime) {
    return { openGraph: { type: 'article', siteName: SITE_NAME, locale: OG_LOCALE, title: i.title, description: i.description, publishedTime: i.publishedTime }, twitter };
  }
  return { openGraph: { type: 'website', siteName: SITE_NAME, locale: OG_LOCALE, title: i.title, description: i.description }, twitter };
}
