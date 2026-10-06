/**
 * Supabase ortam değişkenleri. Hepsi OPSİYONELDİR: yoksa site (dosya tabanlı içerikle) aynen çalışır,
 * yalnızca /admin kapalı kalır.
 *
 * Yalnızca NEXT_PUBLIC_* değişkenleri okunur: anon/publishable anahtar tarayıcıda görünür olacak şekilde tasarlanmıştır
 * ve güvenliği RLS'ten gelir. SUPABASE_SERVICE_ROLE_KEY bu uygulamada ASLA okunmaz (bkz. docs/cms/SECURITY.md).
 *
 * Not: process.env.NEXT_PUBLIC_* erişimleri statik yazılmalıdır (derleyici satır içine alır).
 */
export interface SupabaseEnv {
  url: string;
  key: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export const isSupabaseConfigured = (): boolean => getSupabaseEnv() !== null;
