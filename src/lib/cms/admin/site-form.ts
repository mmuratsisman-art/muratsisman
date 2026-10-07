import type { SiteContentKey } from '../types';
import { CURRENTLY_ROWS, isFriendlyKey, SITE_FIELDS } from '../validate/site';

export { SITE_FIELDS };

export const SITE_KEY_INFO: Record<SiteContentKey, { label: string; description: string }> = {
  hero: { label: 'Hero', description: 'Ana sayfanın üst bölümü: isim, başlık satırları, bağlantı düğmeleri' },
  currently: { label: 'Currently', description: '"Şu an" kartları' },
  about: { label: 'Who is Murat? (About)', description: 'Hakkımda bölümü' },
  contact: { label: 'İletişim', description: 'Sayfa sonundaki iletişim bölümü' },
  site_meta: { label: 'Site bilgisi', description: 'Ad, marka, alan adı, açıklama (JSON)' },
  social: { label: 'Sosyal bağlantılar', description: 'LinkedIn, GitHub, X, e-posta (JSON)' },
  lab_intro: { label: 'Lab giriş metni', description: 'Lab bölümündeki üç satır (JSON)' },
  lab_page: { label: 'Lab sayfası metinleri', description: '/lab sayfasının sabit metinleri (JSON)' },
  notes_page: { label: 'Notlar sayfası metinleri', description: '/notes sayfasının sabit metinleri (JSON)' },
  lab_categories: { label: 'Lab kategorileri', description: 'Lab bölümündeki kategori etiketleri (JSON)' },
};

/** Boş (içerik yok) belge iskeletleri: dosya tabanlı içerikle SESSİZCE birleştirilmez; ilk içerik admin'den ya da içe aktarmayla gelir. */
const JSON_SKELETON: Partial<Record<SiteContentKey, unknown>> = {
  site_meta: { name: '', brand: { left: '', right: '' }, domain: '', description: '' },
  social: { links: [] },
  lab_intro: { lines: [] },
  lab_page: { eyebrow: '', note: '', projectsLinkLabel: '' },
  notes_page: { eyebrow: '', intro: '' },
  lab_categories: { items: [] },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const lines = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join('\n') : '');

/** Veritabanındaki (güvenilmeyen) belge → form alan değerleri. Eksik/bozuk alanlar boş metne düşer (yalnızca gösterim). */
export function siteDocToFormValues(key: SiteContentKey, doc: unknown | null): Record<string, string> {
  const o = isObj(doc) ? doc : {};
  if (!isFriendlyKey(key)) return { json: JSON.stringify(doc ?? JSON_SKELETON[key] ?? {}, null, 2) };

  switch (key) {
    case 'hero': {
      const p = isObj(o.ctaPrimary) ? o.ctaPrimary : {};
      const sec = isObj(o.ctaSecondary) ? o.ctaSecondary : {};
      return {
        eyebrow: s(o.eyebrow), first: s(o.first), last: s(o.last), roles: s(o.roles), message: lines(o.message),
        cta_primary_label: s(p.label), cta_primary_href: s(p.href), cta_secondary_label: s(sec.label), cta_secondary_href: s(sec.href),
        concepts: lines(o.concepts),
      };
    }
    case 'currently': {
      const items = Array.isArray(o.items) ? o.items : [];
      const out: Record<string, string> = {};
      for (let i = 1; i <= CURRENTLY_ROWS; i++) {
        const it = isObj(items[i - 1]) ? (items[i - 1] as Record<string, unknown>) : {};
        out[`item_id_${i}`] = s(it.id);
        out[`label_${i}`] = s(it.label);
        out[`value_${i}`] = s(it.value);
        out[`accent_${i}`] = s(it.accent) || 'blue';
      }
      return out;
    }
    case 'about':
      return { title: s(o.title), text: s(o.text), image_media_id: s(o.imageMediaId) };
    case 'contact': {
      const c = isObj(o.cta) ? o.cta : {};
      return { title: lines(o.title), lines: lines(o.lines), cta_label: s(c.label), cta_href: s(c.href) };
    }
  }
}
