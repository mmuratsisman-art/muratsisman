/**
 * Public içerik katmanı hataları. `code` log için güvenlidir; iç ayrıntı/veri/anahtar ASLA taşımaz.
 *  config  → CONTENT_SOURCE geçersiz ya da cms modunda Supabase yapılandırılmamış
 *  query   → Supabase sorgusu başarısız (ağ, yetki, şema…)
 *  invalid → yayınlanmış veri beklenen sözleşmeye uymuyor (örn. eksik site belgesi)
 */
export type ContentErrorCode = 'config' | 'query' | 'invalid';

export class ContentUnavailableError extends Error {
  constructor(public readonly code: ContentErrorCode, public readonly detail?: string) {
    super(`İçerik şu anda kullanılamıyor (${code})`);
    this.name = 'ContentUnavailableError';
  }
}
