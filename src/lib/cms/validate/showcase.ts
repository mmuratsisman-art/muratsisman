/**
 * Proje "Showcase / Demo" bağlantısı: `case_study.showcase.url`.
 * Tek doğrulama kaynağı burasıdır: `validateCaseStudy` (kaydetme + public okuma), form birleştirmesi ve render savunması aynı kuralı kullanır.
 * Bağımlılıksız ve saf (Next/Supabase/ağ yok).
 */

/** İzin verilen ana alan adı ve onun gerçek alt alan adları. Başka bir ana alan adı için burası tek değişiklik noktasıdır. */
export const SHOWCASE_HOST = 'muratsisman.com.tr';
export const SHOWCASE_URL_MAX = 300;

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const UNSAFE = /[\s\u0000-\u001F\u007F\\]/;

export type ShowcaseUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Yalnızca https ve `muratsisman.com.tr` ya da `*.muratsisman.com.tr`.
 * Reddedilir: http/javascript:/data:, kullanıcı adı-parola, özel port, IP, boşluk/kontrol karakteri/ters eğik çizgi, noktayla biten ya da
 * `xn--` (punycode) etiketli adlar, benzer alan adları (`evilmuratsisman.com.tr`, `muratsisman.com.tr.evil.com`), 300 karakter üstü.
 * Başarılıysa tarayıcının ayrıştırdığı BİÇİM (`URL.href`) döner: karar, gerçekten gidilecek ana makine adı üzerinden verilir.
 */
export function checkShowcaseUrl(input: string): ShowcaseUrlResult {
  const bad = (error: string): ShowcaseUrlResult => ({ ok: false, error });
  if (typeof input !== 'string' || input === '') return bad('Bağlantı boş olamaz.');
  if (input.length > SHOWCASE_URL_MAX) return bad(`Bağlantı en fazla ${SHOWCASE_URL_MAX} karakter olabilir.`);
  if (UNSAFE.test(input)) return bad('Bağlantıda boşluk, kontrol karakteri veya ters eğik çizgi olamaz.');
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return bad('Geçerli bir bağlantı değil (https://… biçiminde olmalı).');
  }
  if (u.protocol !== 'https:') return bad('Yalnızca https:// bağlantıları kabul edilir.');
  if (u.username !== '' || u.password !== '') return bad('Bağlantıda kullanıcı adı veya parola olamaz.');
  if (u.port !== '') return bad('Özel port kabul edilmez.');
  const host = u.hostname;
  const ok = host === SHOWCASE_HOST || host.endsWith(`.${SHOWCASE_HOST}`);
  if (!ok) return bad(`Yalnızca ${SHOWCASE_HOST} ve alt alan adları kabul edilir.`);
  const labels = host.split('.');
  if (!labels.every((l) => LABEL.test(l) && !l.startsWith('xn--'))) return bad('Geçersiz alan adı.');
  return { ok: true, url: u.href };
}

/* ───────────── Form alanı ↔ case_study birleştirmesi ───────────── */

export type ShowcaseMerge =
  | { ok: true; caseText: string }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Ayrı "Demo / Showcase URL" alanını `case_study` JSON'una uygular. Önceliği koruma: SESSİZCE HİÇBİR ŞEY SİLİNMEZ.
 *  - alan ya da başlangıç değeri formda yok (eski sekme/istemci)  → JSON olduğu gibi
 *  - alan = başlangıç değeri (kullanıcı dokunmadı; boş bile olsa)   → JSON olduğu gibi (JSON'daki showcase'e dokunulmaz)
 *  - alan değişti ve dolu  → `showcase.url` ayarlanır (diğer her şey korunur)
 *  - alan değişti ve boş   → `showcase` AÇIKÇA kaldırılır (kullanıcı kutuyu temizledi)
 *  - alan değişti VE JSON'daki showcase başlangıçtan farklı ve alandan da farklı → ÇELİŞKİ: hata (sessiz seçim yok)
 * JSON bozuksa/nesne değilse dokunmadan döner: asıl hatayı `case_study` doğrulaması bildirir.
 * Dönen metin yeniden `validateCaseStudy`'den geçirilir; bu fonksiyon şekil doğrulamaz, yalnızca alanı uygular.
 */
export function mergeShowcaseField(caseText: string, field: string | undefined, initial: string | undefined, comingSoon: boolean): ShowcaseMerge {
  if (field === undefined || initial === undefined) return { ok: true, caseText };
  const f = field.trim();
  const i = initial.trim();
  if (f === i) return { ok: true, caseText };

  if (f !== '') {
    if (comingSoon) return { ok: false, error: '“Çok yakında” projelerin detay sayfası olmadığı için bağlantı eklenemez.' };
    const chk = checkShowcaseUrl(f);
    if (!chk.ok) return { ok: false, error: chk.error };
  }

  const text = caseText.trim();
  if (text === '') {
    if (f === '') return { ok: true, caseText };
    return { ok: false, error: 'Bağlantı eklemek için önce geçerli bir case study (JSON) gerekli.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: true, caseText };
  }
  if (!isObj(parsed)) return { ok: true, caseText };

  const existing = parsed.showcase;
  const jsonUrl = isObj(existing) && typeof existing.url === 'string' ? existing.url.trim() : '';
  if (existing !== undefined && jsonUrl !== i && jsonUrl !== f) {
    return { ok: false, error: 'Case study JSON’undaki showcase.url bu alandan farklı; iki yeri de değiştirdiniz. Birini geri alın.' };
  }

  const next: Record<string, unknown> = { ...parsed };
  if (f === '') delete next.showcase;
  else next.showcase = { ...(isObj(existing) ? existing : {}), url: f };
  return { ok: true, caseText: JSON.stringify(next) };
}

/** Düzenleme formu için: kayıtlı case_study'den (güvenilmeyen jsonb) mevcut bağlantı; yoksa ''. */
export function showcaseUrlOf(caseStudy: unknown): string {
  if (!isObj(caseStudy) || !isObj(caseStudy.showcase)) return '';
  const u = caseStudy.showcase.url;
  return typeof u === 'string' ? u : '';
}
