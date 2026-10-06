import { DB_ERROR_MESSAGES } from '../db-errors';

/** URL'den gelen bilgi/hata anahtarları yalnızca bu beyaz listeden metne çevrilir (URL içeriği ASLA yansıtılmaz). */
const OK: Record<string, string> = {
  created: 'Taslak oluşturuldu.',
  saved: 'Taslak kaydedildi. Yayındaki sürüm değişmedi.',
  published: 'Yayınlandı. (Public site bu aşamada henüz dosya tabanlı içerik kullanıyor.)',
  unpublished: 'Yayından kaldırıldı.',
  discarded: 'Bekleyen değişiklikler atıldı. Yayındaki sürüm olduğu gibi duruyor.',
};

const ERR: Record<string, string> = {
  ...DB_ERROR_MESSAGES,
  confirm: 'Bu işlem için onay kutusunu işaretlemeniz gerekir.',
  published_stale: 'Taslak kaydedildi ancak yayınlanamadı: ' + DB_ERROR_MESSAGES.stale,
};

export interface Flash {
  type: 'ok' | 'error';
  message: string;
}

export function readFlash(params: { ok?: string; err?: string }): Flash | null {
  if (params.ok && Object.hasOwn(OK, params.ok)) return { type: 'ok', message: OK[params.ok] };
  if (params.err && Object.hasOwn(ERR, params.err)) return { type: 'error', message: ERR[params.err] };
  return null;
}
