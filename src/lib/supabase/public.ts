import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { ContentUnavailableError } from '@/lib/content/errors';
import { getSupabaseEnv } from './env';

/**
 * PUBLIC içerik okuma istemcisi: oturumsuz (cookie/header okumaz → sayfaları dinamik yapmaz, önbelleklenebilir), `anon` rolüyle çalışır.
 * Dolayısıyla RLS yalnızca YAYINLANMIŞ satırları döndürür; taslaklara ve admin tablolarına erişemez.
 * Yalnızca yayınlanabilir (publishable/anon) anahtar kabul edilir; service-role/secret anahtar görülürse reddedilir.
 */
function looksLikeServiceKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { role?: unknown };
      return claims.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

export function createPublicClient() {
  const env = getSupabaseEnv();
  if (!env) throw new ContentUnavailableError('config', 'Supabase yapılandırılmamış');
  if (looksLikeServiceKey(env.key)) throw new ContentUnavailableError('config', 'service-role anahtarı public istemcide kullanılamaz');
  return createSupabaseClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const __test = { looksLikeServiceKey };
