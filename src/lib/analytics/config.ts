/**
 * Analytics etkinleştirme kapısı (SAF). Varsayılan: KAPALI.
 * Endpoint, aşağıdakilerin HEPSİ varken çalışır; biri eksikse veri YAZMAZ (204 döner, hiçbir dış çağrı yapılmaz):
 *   ANALYTICS_ENABLED=1            çalışma zamanı ana şalter
 *   ANALYTICS_WAF_CONFIRMED=1      "Vercel WAF hız sınırı kuralı yayında" beyanı. GERÇEK doğrulama DEĞİLDİR; yalnızca bilinçli, elle verilen onaydır
 *   ANALYTICS_HASH_SECRET          en az 32 karakter (günlük kova türetimi için HMAC sırrı)
 *   ANALYTICS_WRITER_EMAIL / ANALYTICS_WRITER_PASSWORD   ayrı, admin olmayan yazıcı hesabı (sunucu tarafı; NEXT_PUBLIC_ DEĞİL)
 *   NEXT_PUBLIC_SUPABASE_URL ve publishable anahtar
 * Ayrıca tarayıcıdaki beacon yalnızca derleme zamanında NEXT_PUBLIC_ANALYTICS_BEACON=1 ise yüklenir.
 * Bu modül DEĞER döndürmez, yalnızca eksik değişkenlerin ADLARINI.
 */
export type AnalyticsEnv = Record<string, string | undefined>;
export type AnalyticsStatus = { enabled: true } | { enabled: false; missing: string[] };

export const MIN_HASH_SECRET_LENGTH = 32;

export function analyticsStatus(env: AnalyticsEnv): AnalyticsStatus {
  const missing: string[] = [];
  if (env.ANALYTICS_ENABLED !== '1') missing.push('ANALYTICS_ENABLED');
  if (env.ANALYTICS_WAF_CONFIRMED !== '1') missing.push('ANALYTICS_WAF_CONFIRMED');
  if (!env.ANALYTICS_HASH_SECRET || env.ANALYTICS_HASH_SECRET.length < MIN_HASH_SECRET_LENGTH) missing.push('ANALYTICS_HASH_SECRET');
  if (!env.ANALYTICS_WRITER_EMAIL) missing.push('ANALYTICS_WRITER_EMAIL');
  if (!env.ANALYTICS_WRITER_PASSWORD) missing.push('ANALYTICS_WRITER_PASSWORD');
  if (!env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  return missing.length === 0 ? { enabled: true } : { enabled: false, missing };
}
