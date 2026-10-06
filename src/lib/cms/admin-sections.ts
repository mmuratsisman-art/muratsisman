/** Gelecekteki admin bölümleri. FAZ 3A'da yalnızca yer tutucu sayfalar var. */
export interface AdminSectionInfo {
  href: string;
  label: string;
  description: string;
  planned: string[];
  phase: string;
}

export const adminSections: AdminSectionInfo[] = [
  {
    href: '/admin/projects',
    label: 'Projeler',
    description: 'Proje vaka çalışmaları',
    phase: '3B',
    planned: ['Oluştur / düzenle / sil', 'Case study bölümleri ve diyagram', 'Sıralama', 'Draft → Preview → Published'],
  },
  {
    href: '/admin/lab',
    label: 'Lab',
    description: 'Deneyler ve prototipler',
    phase: '3B',
    planned: ['Oluştur / düzenle / sil', 'Hikâye alanları (why, how, learned, state)', 'Öne çıkarma', 'Draft → Preview → Published'],
  },
  {
    href: '/admin/notes',
    label: 'Notlar',
    description: 'Kısa notlar ve gözlemler',
    phase: '3B',
    planned: ['Blok tabanlı editör (p, h, quote, list)', 'Okuma süresi', 'Etiketler', 'Draft → Preview → Published'],
  },
  {
    href: '/admin/media',
    label: 'Medya',
    description: 'Görseller',
    phase: '3C',
    planned: ['Yükleme (jpeg, png, webp, avif)', 'Alt metin', 'Boyut ve MIME bilgisi', 'Kullanım takibi'],
  },
  {
    href: '/admin/site',
    label: 'Site',
    description: 'Hero, Currently, About, İletişim',
    phase: '3B',
    planned: ['Hero ve Currently', 'Who is Murat? ve profil fotoğrafı', 'İletişim / sosyal bağlantılar', 'Taslak → yayınla'],
  },
  {
    href: '/admin/seo',
    label: 'SEO',
    description: 'Meta alanları',
    phase: '3D',
    planned: ['SEO başlığı ve açıklama', 'Canonical URL', 'Sosyal paylaşım görseli', 'index / noindex'],
  },
];
