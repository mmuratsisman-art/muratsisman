import { SLUG_PATTERN } from './status';

export const SLUG_MAX = 80;

const TURKISH: Record<string, string> = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', İ: 'i', I: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
};

/**
 * Deterministik slug üretimi: Türkçe karakterler ASCII'ye, küçük harf, boşluk/noktalama → '-', tekrarlı '-' tek,
 * baş/son '-' yok, en fazla 80 karakter. Üretilemezse boş string döner (çağıran bunu hata sayar).
 */
export function slugify(input: string): string {
  const mapped = Array.from(input, (ch) => TURKISH[ch] ?? ch).join('');
  const base = mapped
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, SLUG_MAX).replace(/-+$/g, '');
}

export const isSlug = (slug: string): boolean => slug.length > 0 && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug);
