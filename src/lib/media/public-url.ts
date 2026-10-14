/**
 * Bölüm görselleri için güvenli public adres üretici. SUNUCU ve istemci için güvenlidir (yalnızca NEXT_PUBLIC_SUPABASE_URL okunur; sır yok).
 *
 * Adres her zaman `https://<supabase-host>/storage/v1/object/public/site-media/<path>` biçimindedir; `path` önce `checkFigurePath` ile doğrulanır.
 * Ortam değişkeni yok/geçersizse (statik mod dahil) `null` döner ve görsel render EDİLMEZ: sayfa hata vermez.
 * `next.config.mjs` içindeki `images.remotePatterns` aynı host ve `…/site-media/projects/**` yoluyla sınırlıdır (birim testi eşitliği doğrular).
 */
import { checkFigurePath } from '@/lib/cms/validate/figure';

export const MEDIA_BUCKET = 'site-media';
export const MEDIA_PUBLIC_PATH = `/storage/v1/object/public/${MEDIA_BUCKET}/`;

/** Yalnızca https, kullanıcı adı/parola ve özel port olmayan bir kaynak (origin); aksi halde `null`. */
export function mediaOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Saf biçim (test edilebilir): verilen Supabase URL'si ve figür yolu için public görsel adresi veya `null`. */
export function figureSrcFrom(supabaseUrl: string | undefined, path: unknown): string | null {
  const origin = mediaOrigin(supabaseUrl);
  const checked = checkFigurePath(path);
  if (!origin || !checked.ok) return null;
  return `${origin}${MEDIA_PUBLIC_PATH}${checked.path}`;
}

/** Not: process.env.NEXT_PUBLIC_* erişimi statik yazılmalıdır (derleyici satır içine alır). */
export function figureSrc(path: string): string | null {
  return figureSrcFrom(process.env.NEXT_PUBLIC_SUPABASE_URL, path);
}
