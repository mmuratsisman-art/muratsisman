import type { SocialLink } from '@/types';

/** Footer'ın sabit iletişim adresi (talep: mailto:hello@muratsisman.com.tr). */
export const FOOTER_EMAIL = 'hello@muratsisman.com.tr';

/** KEŞFET sütunu. Lab ve Notlar gerçek sayfalarına, diğerleri ana sayfa bölümlerine gider (Header ile aynı hedefler). */
export const FOOTER_NAV: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Ana Sayfa', href: '/' },
  { label: 'Projeler', href: '/#projects' },
  { label: 'Lab', href: '/lab' },
  { label: 'Notlar', href: '/notes' },
  { label: 'Hakkımda', href: '/#about' },
];

export interface FooterSocial { id: string; label: string; href: string }

/**
 * CMS'teki sosyal bağlantılardan YALNIZCA gerçek olanları döndürür.
 * Elenenler: e-posta kaydı (footer'da sabit adres var), boş/`#`/göreli placeholder'lar, https dışı şemalar, geçersiz URL'ler.
 * Uydurma veya yedek URL üretilmez; hiç gerçek bağlantı yoksa liste boştur.
 */
export function usableSocialLinks(links: ReadonlyArray<SocialLink> | null | undefined): FooterSocial[] {
  if (!Array.isArray(links)) return [];
  const out: FooterSocial[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    if (!l || typeof l.id !== 'string' || typeof l.label !== 'string' || typeof l.href !== 'string') continue;
    if (l.id === 'email') continue;
    const label = l.label.trim();
    if (!label) continue;
    let u: URL;
    try { u = new URL(l.href.trim()); } catch { continue; }
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) continue;
    const key = u.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: l.id, label, href: u.href });
  }
  return out;
}
