import { isValidSlug } from '@/lib/cms/status';

/**
 * Analytics için izin verilen sayfa yolları (SAF; tarayıcıda ve sunucuda aynı kural).
 * Yalnızca bilinen public rotalar sayılır; sorgu dizesi, parça (#), yüzde kodlaması, sondaki eğik çizgi ve büyük harf KABUL EDİLMEZ.
 * SQL tarafındaki record_hit() aynı kuralı (ve ayrıca yayınlanmış içerik varlığını) yeniden doğrular.
 */
export type HitKind = 'page' | 'showcase';

export const MAX_PATH_LENGTH = 120;
const SINGLE_PATHS: ReadonlySet<string> = new Set(['/', '/lab', '/notes']);

export function normalizePagePath(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_PATH_LENGTH) return null;
  if (SINGLE_PATHS.has(input)) return input;
  const m = /^\/(projects|lab|notes)\/([^/]+)$/.exec(input);
  if (!m || !isValidSlug(m[2])) return null;
  return input;
}

export function normalizeShowcaseSlug(input: unknown): string | null {
  return typeof input === 'string' && isValidSlug(input) ? input : null;
}

/** '/projects/x' → { section: 'projects', slug: 'x' }; '/', '/lab', '/notes' → slug null */
export function splitPagePath(path: string): { section: 'projects' | 'lab' | 'notes' | null; slug: string | null } {
  const m = /^\/(projects|lab|notes)\/(.+)$/.exec(path);
  if (!m) return { section: null, slug: null };
  return { section: m[1] as 'projects' | 'lab' | 'notes', slug: m[2] };
}
