import { createHmac } from 'node:crypto';

/**
 * Günlük yaklaşık tekil ziyaretçi için KOVA numarası (0..65535). Sunucuda hesaplanır; yalnızca bu 16 bit veritabanına gider.
 * Girdiler (gün, IP, User-Agent) HİÇBİR YERE yazılmaz ve loglanmaz. Gün tarihi hash'e girdiği için aynı kişi ertesi gün farklı kovaya
 * düşer: günler arası bağlama YAPILAMAZ (7/30 günlük tekil bu yüzden üretilemez).
 */
export function istanbulDay(d: Date): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function visitorBucket(secret: string, day: string, ip: string, userAgent: string): number {
  const h = createHmac('sha256', secret).update(`${day}\n${ip}\n${userAgent}`).digest();
  return (h[0] << 8) | h[1];
}
