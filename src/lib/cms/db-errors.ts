/**
 * PostgreSQL / PostgREST / 0004 fonksiyon hatalarını kullanıcı dostu türlere çevirir.
 * Ham hata ASLA kullanıcıya gösterilmez; yalnızca bu türlere karşılık gelen sabit mesajlar gösterilir.
 */
export type DbErrorKind = 'slug_taken' | 'stale' | 'forbidden' | 'slug_locked' | 'not_found' | 'invalid_state' | 'invalid_data' | 'unknown';

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
}

export const DB_ERROR_MESSAGES: Record<DbErrorKind, string> = {
  slug_taken: 'Bu slug başka bir içerikte kullanılıyor. Farklı bir slug seçin.',
  stale: 'İçerik siz düzenlerken değişmiş. Yenileyip tekrar deneyin.',
  forbidden: 'Bu işlem için yetkiniz yok.',
  slug_locked: "Yayındaki içeriğin slug'ı değiştirilemez (adres kırılır). Önce yayından kaldırın.",
  not_found: 'Kayıt bulunamadı.',
  invalid_state: 'Bu işlem içeriğin mevcut durumunda yapılamaz.',
  invalid_data: 'Kaydedilemedi: alanlardan biri geçersiz.',
  unknown: 'Kaydedilemedi. Lütfen tekrar deneyin.',
};

export function classifyDbError(e: DbErrorLike): DbErrorKind {
  const msg = (e.message ?? '').trim();
  const code = e.code ?? '';

  // 0004 fonksiyon ve tetikleyici mesajları (önce bunlar: aynı SQLSTATE'i paylaşabilirler)
  if (msg === 'stale_draft') return 'stale';
  if (msg === 'forbidden') return 'forbidden';
  if (msg === 'not_found') return 'not_found';
  if (msg === 'nothing_to_publish' || msg === 'not_published' || msg === 'nothing_to_discard') return 'invalid_state';
  if (msg === 'published content slug cannot be changed') return 'slug_locked';
  if (msg.startsWith('invalid status transition') || msg.startsWith('new content must start as draft')) return 'invalid_state';

  if (code === '23505') return 'slug_taken'; // tek benzersiz kısıt: slug
  if (code === '42501') return 'forbidden';
  if (code === 'P0002') return 'not_found';
  if (code === '40001') return 'stale';
  if (['23502', '23514', '22P02', '22023', '22007', '22003', '22001'].includes(code)) return 'invalid_data';
  return 'unknown';
}
