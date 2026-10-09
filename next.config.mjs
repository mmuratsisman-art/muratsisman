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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { BUILT_CONTENT_SOURCE: normalizeBuiltSource(process.env.CONTENT_SOURCE) },
};
export default nextConfig;
