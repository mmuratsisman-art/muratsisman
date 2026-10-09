'use strict';
/**
 * FAZ 3B-F0 — ÇEVRİMDIŞI Google Fonts taklidi (yalnızca F0 sandbox build'leri için).
 *
 * Next.js `next/font/google`, build sırasında fonts.googleapis.com'dan CSS ve fonts.gstatic.com'dan font dosyası indirir.
 * `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<bu dosyanın mutlak yolu>` ayarlıysa Next, ağa çıkmak yerine bu modülü `require` eder ve
 * `modül[istek_url'si]` ile CSS metnini alır (URL yoksa "Missing mocked response" hatasıyla build'i DURDURUR — sessizce ağa çıkmaz).
 * Font DOSYASI için de ağa çıkılmaz: mock modunda Next, URL mutlak yol değilse içeriği `Buffer.from(url)` yapar (belirleyici, yerel).
 *
 * Bu dosya AĞ KODU İÇERMEZ (net/http/https/dns/tls/child_process yok). Font URL'leri `.invalid` (RFC 2606, hiçbir zaman çözümlenmez)
 * alan adındadır: yanlışlıkla fetch edilse bile gerçek bir sunucuya ulaşamaz ve egress guard engeller.
 * Font içeriği gerçek bir font DEĞİLDİR (yer tutucu); F0'da tarayıcı yoktur, yalnızca build/yönlendirme/önbellek davranışı ölçülür.
 */
const PREFIX = 'https://fonts.googleapis.com/css2?';
const SUBSETS = [
  ['latin-ext', 'U+0100-02BA, U+02BD-02C5, U+1E00-1EFF, U+2020, U+20A0-20AB, U+2113, U+2C60-2C7F, U+A720-A7FF'],
  ['latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "wght@100..900", "ital,wght@0,400;1,400", "opsz,wdth,wght@12..96,75..100,200..800" veya eksensiz → yüzler (stil+ağırlık). */
function faces(axesStr, valsStr) {
  if (!axesStr || !valsStr) return [{ style: 'normal', weight: '400' }];
  const axes = axesStr.split(',');
  const seen = new Set();
  const out = [];
  for (const tuple of valsStr.split(';')) {
    const vals = tuple.split(',');
    let style = 'normal';
    let weight = '400';
    axes.forEach((a, i) => {
      const v = vals[i];
      if (a === 'ital' && v === '1') style = 'italic';
      if (a === 'wght' && v) weight = v.replace('..', ' ');
    });
    const key = style + '|' + weight;
    if (!seen.has(key)) { seen.add(key); out.push({ style, weight }); }
  }
  return out;
}

function cssFor(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) return undefined;
  const params = url.slice(PREFIX.length).split('&');
  const display = (params.find((p) => p.startsWith('display=')) || 'display=swap').slice(8) || 'swap';
  const families = params.filter((p) => p.startsWith('family=')).map((p) => p.slice(7));
  if (families.length === 0) return undefined;
  const blocks = [];
  for (const fam of families) {
    const colon = fam.indexOf(':');
    const rawName = colon === -1 ? fam : fam.slice(0, colon);
    const name = decodeURIComponent(rawName.replace(/\+/g, ' '));
    const spec = colon === -1 ? '' : fam.slice(colon + 1);
    const at = spec.indexOf('@');
    const axes = at === -1 ? '' : spec.slice(0, at);
    const vals = at === -1 ? '' : spec.slice(at + 1);
    for (const f of faces(axes, vals)) {
      for (const [subset, range] of SUBSETS) {
        blocks.push(
          `/* ${subset} */\n@font-face {\n  font-family: '${name}';\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: ${display};\n` +
          `  src: url(https://fonts.gstatic.invalid/f0-offline/${slug(name)}-${f.style}-${slug(f.weight)}-${subset}.woff2) format('woff2');\n  unicode-range: ${range};\n}`,
        );
      }
    }
  }
  return blocks.join('\n');
}

// Next `mockFile[url]` ile okur. Yalnızca Google Fonts css2 URL'leri yanıtlanır; başka her şey undefined → Next hata verir (ağa ÇIKILMAZ).
module.exports = new Proxy(Object.create(null), {
  get(_t, key) { return typeof key === 'string' ? cssFor(key) : undefined; },
  has(_t, key) { return typeof key === 'string' && cssFor(key) !== undefined; },
});
