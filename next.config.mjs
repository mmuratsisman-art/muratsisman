/**
 * Build anındaki CONTENT_SOURCE sınıfı ('static' | 'cms' | 'invalid') pakete gömülür; src/instrumentation.ts çalışma zamanı değeriyle karşılaştırır.
 * Kural, src/lib/content/source.ts ve build-guard.ts `normalizeSource` ile AYNI olmalıdır (birim testi eşitliği doğrular).
 * Ham değer gömülmez; yalnızca üç sabit sınıf adından biri.
 */
const normalizeBuiltSource = (raw) => {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'static') return 'static';
  if (v === 'cms') return 'cms';
  return 'invalid';
};

/**
 * Bölüm görselleri (case_study figure) için TEK izinli uzak kaynak: Supabase public `site-media` bucket'ının `projects/` klasörü.
 * Kural, src/lib/media/public-url.ts (`mediaOrigin`, MEDIA_PUBLIC_PATH) ile AYNI olmalıdır (birim testi eşitliği doğrular).
 * Yalnızca https; kullanıcı adı/parola, özel port ve sorgu dizesi yok; joker host yok. Ortam değişkeni yok/geçersizse hiçbir uzak görsele izin verilmez.
 */
const figureRemotePatterns = (raw) => {
  try {
    const u = new URL(raw ?? '');
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname) return [];
    return [{ protocol: 'https', hostname: u.hostname, port: '', pathname: '/storage/v1/object/public/site-media/projects/**', search: '' }];
  } catch {
    return [];
  }
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { BUILT_CONTENT_SOURCE: normalizeBuiltSource(process.env.CONTENT_SOURCE) },
  // Biçim: Next.js varsayılanı (WebP). Yeni uzak desen eklemek güvenlik incelemesi gerektirir.
  images: { remotePatterns: figureRemotePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL) },
};
export default nextConfig;
