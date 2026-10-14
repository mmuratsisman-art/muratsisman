/**
 * Bölüm görseli: `case_study.sections[].figure = { path, alt, width, height, caption? }`.
 * Tek doğrulama kaynağı burasıdır: `validateCaseStudy` (kaydetme + public okuma + önizleme) ve görsel adresi üreticisi (lib/media/public-url.ts) aynı kuralı kullanır.
 * Bağımlılıksız ve saf (Next/Supabase/ağ yok).
 *
 * `path` bir URL DEĞİL, `site-media` bucket'ı içindeki göreli dosya yoludur ve mutlaka `projects/` ile başlar.
 * Reddedilir: şema/host içeren değerler (`https://…`, `//…`), mutlak yol, `..` ve `.` segmentleri, ters eğik çizgi, `%` (kodlanmış karakter),
 * boşluk/kontrol karakteri, büyük harf, `projects/` dışı yollar, jpg/jpeg/png/webp/avif dışındaki uzantılar (SVG dahil).
 */
import type { CaseFigure } from '@/types';
import { isObj, keysOk, str, type Issues, type Obj } from './schema';

export const FIGURE_PATH_PREFIX = 'projects/';
export const FIGURE_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
export const FIGURE_LIMITS = { path: 200, segments: 5, alt: 200, caption: 200, dimension: 8000, perProject: 6 } as const;

/** `projects/` + en çok 4 segment; her segment küçük harf/rakamla başlar; son segment izinli bir uzantıyla biter. */
const PATH = /^projects(\/[a-z0-9][a-z0-9._-]*)+\.(jpg|jpeg|png|webp|avif)$/;

export type FigurePathResult = { ok: true; path: string } | { ok: false; error: string };

export function checkFigurePath(input: unknown): FigurePathResult {
  const bad = (error: string): FigurePathResult => ({ ok: false, error });
  if (typeof input !== 'string' || input === '') return bad('Görsel yolu boş olamaz.');
  if (input.length > FIGURE_LIMITS.path) return bad(`Görsel yolu en fazla ${FIGURE_LIMITS.path} karakter olabilir.`);
  if (!input.startsWith(FIGURE_PATH_PREFIX)) return bad(`Görsel yolu "${FIGURE_PATH_PREFIX}" ile başlamalı (serbest URL kabul edilmez).`);
  if (input.includes('..') || input.includes('//')) return bad('Görsel yolunda ".." veya "//" olamaz.');
  if (input.split('/').length > FIGURE_LIMITS.segments) return bad(`Görsel yolu en fazla ${FIGURE_LIMITS.segments} bölümden oluşabilir.`);
  if (!PATH.test(input)) return bad(`Görsel yolu küçük harf, rakam, "-", "_", "." içermeli ve ${FIGURE_EXTENSIONS.join(', ')} uzantılarından biriyle bitmeli.`);
  return { ok: true, path: input };
}

function dimension(o: Obj, k: 'width' | 'height', path: string, iss: Issues): number | undefined {
  const v = o[k];
  if (v === undefined) return void iss.add(`${path}.${k}`, 'zorunlu');
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > FIGURE_LIMITS.dimension) return void iss.add(`${path}.${k}`, `1–${FIGURE_LIMITS.dimension} arası tam sayı olmalı`);
  return v;
}

/** Doğrulanmış figür (alanlardan yeniden kurulur; bilinmeyen alan reddedilir) veya `undefined` (sorunlar `iss`'e eklenir). */
export function validateFigure(v: unknown, path: string, iss: Issues): CaseFigure | undefined {
  if (!isObj(v)) return void iss.add(path, 'nesne olmalı');
  keysOk(v, ['path', 'alt', 'width', 'height', 'caption'], path, iss);
  let p: string | undefined;
  if (v.path === undefined) iss.add(`${path}.path`, 'zorunlu');
  else {
    const r = checkFigurePath(v.path);
    if (r.ok) p = r.path;
    else iss.add(`${path}.path`, r.error);
  }
  const alt = str(v, 'alt', path, iss, FIGURE_LIMITS.alt);
  const width = dimension(v, 'width', path, iss);
  const height = dimension(v, 'height', path, iss);
  const caption = v.caption === undefined ? undefined : str(v, 'caption', path, iss, FIGURE_LIMITS.caption);
  if (p === undefined || alt === undefined || width === undefined || height === undefined) return undefined;
  if (v.caption !== undefined && caption === undefined) return undefined;
  const out: CaseFigure = { path: p, alt, width, height };
  if (caption !== undefined) out.caption = caption;
  return out;
}
