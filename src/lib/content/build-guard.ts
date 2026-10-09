/**
 * Build ↔ çalışma zamanı CONTENT_SOURCE uyumu (FAZ 3B-F1: M08).
 *
 * Sorun: `static` olarak derlenen sayfalar build'de üretilip hazır HTML olarak sunulur; çalışma zamanındaki `CONTENT_SOURCE=cms` onlara hiç ulaşmaz
 * (sessizce statik içerik). Ters yön (`cms` build + `static` çalışma) da bilinçsiz bir yapılandırma kaymasıdır.
 *
 * Çözüm: build anındaki değer `next.config.mjs` → `env.BUILT_CONTENT_SOURCE` ile pakete GÖMÜLÜR ('static' | 'cms' | 'invalid').
 * `instrumentation.ts` → `register()` sunucu başlarken bunu çalışma zamanı değeriyle karşılaştırır; uyumsuzsa başlatmayı REDDEDER
 * (kodlu log satırı + çıkış kodu 78). İstek anında bir kontrol gerekmez ve statik sayfa yolu hiç etkilenmez.
 *
 * Kapsam dışı (bilinçli): çalışma zamanı değeri GEÇERSİZ ve build 'cms' ise başlatma reddedilmez; dinamik sayfalar zaten `getContentSource()` ile
 * istek anında fail-closed (5xx) olur (F0 M06 bunu ölçer). Build 'static' + çalışma zamanı geçersiz ise reddedilir (aksi halde statik sayfalar sessizce sunulurdu).
 */
export type BuiltSource = 'static' | 'cms' | 'invalid';

/** `getContentSource` ile aynı normalizasyon (source.ts), ama FIRLATMAZ. next.config.mjs aynı kuralı kopyalar; eşitlik birim testiyle korunur. */
export function normalizeSource(raw: string | undefined): BuiltSource {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'static') return 'static';
  if (v === 'cms') return 'cms';
  return 'invalid';
}

export const BUILD_MISMATCH_CODE = 'CONTENT_SOURCE_BUILD_RUNTIME_MISMATCH';
export const BUILD_MISMATCH_EXIT_CODE = 78;

export type GuardDecision = { ok: true; reason: 'match' | 'skipped-dev' | 'skipped-no-marker' | 'runtime-invalid-handled-per-request' } | { ok: false; built: BuiltSource; runtime: BuiltSource };

export function decideBuildRuntime(built: string | undefined, runtimeRaw: string | undefined, nodeEnv: string | undefined): GuardDecision {
  if (nodeEnv !== 'production') return { ok: true, reason: 'skipped-dev' };
  // İşaret yoksa (ör. eski bir build): doğrulanamaz. Reddetmek kesinti riski taşır; "doğrulanamadı" olarak GÖRÜNÜR biçimde loglanır (bkz. enforce).
  if (built !== 'static' && built !== 'cms' && built !== 'invalid') return { ok: true, reason: 'skipped-no-marker' };
  const runtime = normalizeSource(runtimeRaw);
  if (built === 'invalid') return { ok: false, built, runtime };
  if (runtime === 'invalid') {
    return built === 'static' ? { ok: false, built, runtime } : { ok: true, reason: 'runtime-invalid-handled-per-request' };
  }
  return built === runtime ? { ok: true, reason: 'match' } : { ok: false, built, runtime };
}

export interface GuardDeps {
  built: string | undefined;
  runtime: string | undefined;
  nodeEnv: string | undefined;
  log: (line: string) => void;
  exit: (code: number) => never | void;
}

/** register() çağırır. Uyumsuzlukta log + çıkış; çağıran süreç başlamaz. Değerler (ortam) loga YAZILMAZ — yalnızca normalize sınıf adları. */
export function enforceBuildSourceMatch(deps: GuardDeps): GuardDecision {
  const d = decideBuildRuntime(deps.built, deps.runtime, deps.nodeEnv);
  if (d.ok) {
    if (d.reason === 'skipped-no-marker') deps.log('[content] UYARI: build işareti yok; build/çalışma zamanı CONTENT_SOURCE uyumu DOĞRULANAMADI.');
    return d;
  }
  deps.log(`[content] ${BUILD_MISMATCH_CODE}: build=${d.built} runtime=${d.runtime}. Sunucu başlatılmadı (sessiz kaynak kayması engellendi). Aynı CONTENT_SOURCE ile yeniden derleyin.`);
  deps.exit(BUILD_MISMATCH_EXIT_CODE);
  return d;
}
