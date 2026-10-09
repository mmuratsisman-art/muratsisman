import { ContentUnavailableError } from './errors';

export type ContentSource = 'static' | 'cms';

/**
 * Public içerik kaynağı (SADECE sunucu tarafı env; NEXT_PUBLIC değil, tarayıcıya gitmez).
 *   (boş) | static → mevcut dosya tabanlı içerik (src/data/*)  — VARSAYILAN, bu faz deploy edilince davranış DEĞİŞMEZ
 *   cms            → Supabase'in YAYINLANMIŞ içeriği; hata durumunda statik içeriğe SESSİZCE DÖNÜLMEZ
 * Geçersiz değer → hata (sessizce statik/cms seçilmez).
 */
export function getContentSource(raw: string | undefined = process.env.CONTENT_SOURCE): ContentSource {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'static') return 'static';
  if (v === 'cms') return 'cms';
  throw new ContentUnavailableError('config', 'CONTENT_SOURCE geçersiz');
}
