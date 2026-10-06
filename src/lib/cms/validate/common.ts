import type { Accent } from '@/types';
import { slugify } from '../slug';

export type Errors = Record<string, string>;
export type ValidationMode = 'draft' | 'publish';
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Errors };

export const ACCENT_VALUES: readonly Accent[] = ['blue', 'green', 'orange', 'purple'];
export const isAccent = (v: string): v is Accent => (ACCENT_VALUES as readonly string[]).includes(v);

/** Satır sonlarını normalize eder ve kenar boşluklarını atar. */
export const clean = (v: string | undefined): string => (v ?? '').replace(/\r\n?/g, '\n').trim();

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const hasControlChars = (v: string): boolean => CONTROL.test(v);

/** Virgül veya satır sonu ile ayrılmış etiketler: tekilleştirilir, sırası korunur. */
export function parseTags(input: string, errors: Errors, key = 'tags'): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of clean(input).split(/[,\n]/)) {
    const t = part.trim();
    if (!t) continue;
    if (t.length > 30) {
      errors[key] = `Her etiket en fazla 30 karakter olabilir ("${t.slice(0, 12)}…").`;
      return [];
    }
    if (hasControlChars(t)) {
      errors[key] = 'Etiketlerde geçersiz karakter var.';
      return [];
    }
    // Tekilleştirme anahtarı: Türkçe karakter/büyük-küçük harf farkından bağımsız (AI = ai, İstanbul = istanbul)
    const k = slugify(t) || t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    tags.push(t);
  }
  if (tags.length > 12) errors[key] = 'En fazla 12 etiket kullanılabilir.';
  return tags;
}

/** 'YYYY-MM-DD' (gerçek takvim tarihi) → 'YYYY-MM-DDT00:00:00Z'. Boş → null. */
export function parseDateOnly(input: string): { ok: true; value: string | null } | { ok: false } {
  const v = clean(input);
  if (!v) return { ok: true, value: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return { ok: false };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { ok: false };
  if (y < 2000 || y > 2100) return { ok: false };
  return { ok: true, value: `${v}T00:00:00Z` };
}

/** Boş → null. Aksi halde tam sayı ve aralıkta olmalı. */
export function parseOptionalInt(input: string, min: number, max: number): { ok: true; value: number | null } | { ok: false } {
  const v = clean(input);
  if (!v) return { ok: true, value: null };
  if (!/^\d+$/.test(v)) return { ok: false };
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

/** Boş satırla ayrılmış paragraflar. */
export const toParagraphs = (input: string): string[] =>
  clean(input)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
