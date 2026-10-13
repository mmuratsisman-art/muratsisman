/**
 * Hakkımda (About 2.0) bölümünün KODDA tutulan parçaları. (Public bileşenler `@/data/*` içe aktarmaz; bu yüzden bileşenin yanında durur.) CMS'ten yalnızca `about.title` ve `about.text` gelir
 * (CMS şeması bilerek genişletilmedi); burada etiket, çalışma alanları, slogan, bağlantılar ve görsel ayarı bulunur.
 */

export const ABOUT_EYEBROW = 'ABOUT / MURAT/LAB';

export const ABOUT_AREAS: ReadonlyArray<{ label: string; text: string }> = [
  { label: 'AI TOOLS', text: 'Yapay zekâ destekli araçlar ve asistanlar' },
  { label: 'AUTOMATION', text: 'İş süreçlerini kolaylaştıran otomasyonlar' },
  { label: 'DIGITAL PRODUCTS', text: 'Web uygulamaları ve dijital ürünler' },
  { label: 'OPERATIONS', text: 'Teknik destek, süreç ve kalite geliştirme' },
];

export const ABOUT_SLOGAN = { lead: 'IDEAS INTO', accent: 'REALITY.', note: 'Fikirden çalışan ürüne.' };

export const ABOUT_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Seçilmiş Projeler', href: '/#projects' },
  { label: "Lab'da neler denedim", href: '/lab' },
];

export interface AboutPhoto { src: string; alt: string; width: number; height: number }

/**
 * Gerçek fotoğraf için tek ayar noktası. `null` iken geometrik marka kompozisyonu gösterilir.
 * Fotoğraf eklemek için dosyayı `public/` altına koyup burayı doldurmak yeterlidir (ör. src: '/murat.jpg', alt: 'Murat Şişman').
 */
export const ABOUT_PHOTO: AboutPhoto | null = null;

/** `about.text` boş satırlarla paragraflara ayrılır. Tek cümlelik (eski) metin de tek paragraf olarak düzgün görünür. */
export function aboutParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/\n+/).map((p) => p.trim()).filter(Boolean);
}
