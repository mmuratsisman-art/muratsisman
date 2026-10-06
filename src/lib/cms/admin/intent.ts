/**
 * Form işlem türü (intent). SAF modül: hem sunucu hem istemci tarafından içe aktarılır.
 *
 * NEDEN VAR: Daha önce intent, gönderen düğmenin name/value'sundan okunuyordu. Bir <form action={fn}> React tarafından
 * sentetik olarak gönderildiğinde submitter'ın name/value'sunun FormData'ya girmesi bir React uygulama ayrıntısıdır
 * (sürüme bağlı; düğmede `formAction` prop'u varsa React submitter'ı bilerek atar). Bu yüzden:
 *   - İSTEMCİ, intent'i FormData'ya AÇIKÇA yazar (bkz. components/admin/useIntentAction.ts),
 *   - SUNUCU, geçerli bir intent GELMEZSE hiçbir şey yapmaz (fail-closed): sessizce "kaydet"e DÜŞMEZ.
 */
export const INTENTS = ['save', 'publish'] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_ERROR_MESSAGE = 'İşlem türü belirlenemedi; hiçbir değişiklik yapılmadı. Sayfayı yenileyip tekrar deneyin.';

/** Yalnızca TAM eşleşme kabul edilir ('publish ' veya 'PUBLISH' geçersizdir). Bilinmeyen/eksik → null. */
export function parseIntent(value: FormDataEntryValue | null): Intent | null {
  return typeof value === 'string' && (INTENTS as readonly string[]).includes(value) ? (value as Intent) : null;
}
