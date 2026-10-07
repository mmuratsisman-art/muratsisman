import type { Accent, CurrentlyItem, LabCategory, SocialLink } from '@/types';
import { SITE_CONTENT_KEYS, type SiteContentKey, type SiteContentMap } from '../types';
import { clean, isAccent, type Errors, type ValidationResult } from './common';
import { isObj, isSafeHref, Issues, keysOk, str, strList, type Obj } from './schema';

/** Kullanıcı dostu form ile yönetilen anahtarlar */
export const FRIENDLY_SITE_KEYS = ['hero', 'currently', 'about', 'contact'] as const;
/** Doğrulanmış JSON editörüyle yönetilen anahtarlar */
export const JSON_SITE_KEYS = ['site_meta', 'social', 'lab_intro', 'lab_page', 'notes_page', 'lab_categories'] as const;
export type FriendlySiteKey = (typeof FRIENDLY_SITE_KEYS)[number];
export type JsonSiteKey = (typeof JSON_SITE_KEYS)[number];

export const isSiteKey = (v: string): v is SiteContentKey => (SITE_CONTENT_KEYS as readonly string[]).includes(v);
export const isFriendlyKey = (k: SiteContentKey): k is FriendlySiteKey => (FRIENDLY_SITE_KEYS as readonly string[]).includes(k);

export type SiteDoc = SiteContentMap[SiteContentKey];

export const SITE_LIMITS = { json: 20_000, currentlyRows: 6, concepts: 4 } as const;
const ID = /^[a-z0-9][a-z0-9-]{0,29}$/;
const HOST = /^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?\.[a-z]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function href(o: Obj, k: string, path: string, iss: Issues): string | undefined {
  const v = str(o, k, path, iss, 300);
  if (v !== undefined && !isSafeHref(v)) iss.add(`${path}.${k}`, 'geçersiz bağlantı (#bölüm, /yol, https://… veya mailto:… olmalı)');
  return v;
}
function cta(v: unknown, path: string, iss: Issues): { label: string; href: string } | undefined {
  if (!isObj(v)) return void iss.add(path, 'nesne olmalı');
  keysOk(v, ['label', 'href'], path, iss);
  const label = str(v, 'label', path, iss, 40);
  const h = href(v, 'href', path, iss);
  return label && h ? { label, href: h } : undefined;
}
function uniqueIds(ids: string[], path: string, iss: Issues) {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) iss.add(`${path}[${i}].id`, `"${id}" kimliği tekrar ediyor`);
    seen.add(id);
  });
}
function idOf(o: Obj, path: string, iss: Issues): string | undefined {
  const v = o.id;
  if (typeof v !== 'string' || !ID.test(v)) return void iss.add(`${path}.id`, 'küçük harf/rakam/tire içeren kısa bir kimlik olmalı');
  return v;
}
const accentOf = (o: Obj, path: string, iss: Issues): Accent | undefined => {
  const v = o.accent;
  if (typeof v !== 'string' || !isAccent(v)) return void iss.add(`${path}.accent`, 'blue | green | orange | purple olmalı');
  return v;
};

/**
 * 10 site içeriği belgesinin SIKI şekil doğrulaması (bilinmeyen alanlar reddedilir, çıktı yeniden kurulur).
 * Hem kullanıcı dostu formlar hem JSON editörü, veritabanına gitmeden önce buradan geçer.
 */
export function validateSiteDoc(key: SiteContentKey, value: unknown): { ok: true; value: SiteDoc } | { ok: false; error: string } {
  const iss = new Issues();
  const done = (v: SiteDoc | undefined): { ok: true; value: SiteDoc } | { ok: false; error: string } =>
    v && !iss.any ? { ok: true, value: v } : { ok: false, error: iss.text() || 'Belge geçersiz.' };
  if (!isObj(value)) return { ok: false, error: 'Belge bir nesne ({ ... }) olmalı.' };
  const o = value;

  switch (key) {
    case 'hero': {
      keysOk(o, ['eyebrow', 'first', 'last', 'roles', 'message', 'ctaPrimary', 'ctaSecondary', 'concepts'], 'hero', iss);
      const eyebrow = str(o, 'eyebrow', 'hero', iss, 80);
      const first = str(o, 'first', 'hero', iss, 40);
      const last = str(o, 'last', 'hero', iss, 40);
      const roles = str(o, 'roles', 'hero', iss, 160);
      const message = strList(o.message, 'hero.message', iss, { min: 1, max: 6, item: 120 });
      const ctaPrimary = cta(o.ctaPrimary, 'hero.ctaPrimary', iss);
      const ctaSecondary = cta(o.ctaSecondary, 'hero.ctaSecondary', iss);
      const concepts = strList(o.concepts, 'hero.concepts', iss, { min: SITE_LIMITS.concepts, max: SITE_LIMITS.concepts, item: 24 });
      return done(eyebrow && first && last && roles && message && ctaPrimary && ctaSecondary && concepts ? { eyebrow, first, last, roles, message, ctaPrimary, ctaSecondary, concepts } : undefined);
    }
    case 'currently': {
      keysOk(o, ['items'], 'currently', iss);
      const items: CurrentlyItem[] = [];
      if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 8) iss.add('currently.items', '1–8 öğe olmalı');
      else
        o.items.forEach((it, i) => {
          const p = `currently.items[${i}]`;
          if (!isObj(it)) return void iss.add(p, 'nesne olmalı');
          keysOk(it, ['id', 'label', 'value', 'accent'], p, iss);
          const id = idOf(it, p, iss);
          const label = str(it, 'label', p, iss, 30);
          const v = str(it, 'value', p, iss, 60);
          const accent = accentOf(it, p, iss);
          if (id && label && v && accent) items.push({ id, label, value: v, accent });
        });
      uniqueIds(items.map((i) => i.id), 'currently.items', iss);
      return done({ items });
    }
    case 'about': {
      keysOk(o, ['title', 'text', 'imageMediaId'], 'about', iss);
      const title = str(o, 'title', 'about', iss, 80);
      const text = str(o, 'text', 'about', iss, 600);
      let imageMediaId: string | undefined;
      if (o.imageMediaId !== undefined) {
        if (typeof o.imageMediaId === 'string' && UUID.test(o.imageMediaId)) imageMediaId = o.imageMediaId;
        else iss.add('about.imageMediaId', 'geçerli bir medya kimliği (UUID) olmalı');
      }
      return done(title && text ? (imageMediaId ? { title, text, imageMediaId } : { title, text }) : undefined);
    }
    case 'contact': {
      keysOk(o, ['title', 'lines', 'cta'], 'contact', iss);
      const title = strList(o.title, 'contact.title', iss, { min: 1, max: 3, item: 40 });
      const lines = strList(o.lines, 'contact.lines', iss, { min: 1, max: 6, item: 120 });
      const c = cta(o.cta, 'contact.cta', iss);
      return done(title && lines && c ? { title, lines, cta: c } : undefined);
    }
    case 'site_meta': {
      keysOk(o, ['name', 'brand', 'domain', 'description'], 'site_meta', iss);
      const name = str(o, 'name', 'site_meta', iss, 60);
      let brand: { left: string; right: string } | undefined;
      if (!isObj(o.brand)) iss.add('site_meta.brand', 'nesne olmalı');
      else {
        keysOk(o.brand, ['left', 'right'], 'site_meta.brand', iss);
        const left = str(o.brand, 'left', 'site_meta.brand', iss, 20);
        const right = str(o.brand, 'right', 'site_meta.brand', iss, 20);
        if (left && right) brand = { left, right };
      }
      const domain = str(o, 'domain', 'site_meta', iss, 100);
      if (domain && !HOST.test(domain)) iss.add('site_meta.domain', 'geçerli bir alan adı olmalı (ör. example.com)');
      const description = str(o, 'description', 'site_meta', iss, 300);
      return done(name && brand && domain && description ? { name, brand, domain, description } : undefined);
    }
    case 'social': {
      keysOk(o, ['links'], 'social', iss);
      const links: SocialLink[] = [];
      if (!Array.isArray(o.links) || o.links.length > 10) iss.add('social.links', '0–10 bağlantı olmalı');
      else
        o.links.forEach((l, i) => {
          const p = `social.links[${i}]`;
          if (!isObj(l)) return void iss.add(p, 'nesne olmalı');
          keysOk(l, ['id', 'label', 'href'], p, iss);
          const id = idOf(l, p, iss);
          const label = str(l, 'label', p, iss, 30);
          const h = href(l, 'href', p, iss);
          if (id && label && h) links.push({ id, label, href: h });
        });
      uniqueIds(links.map((l) => l.id), 'social.links', iss);
      return done({ links });
    }
    case 'lab_intro': {
      keysOk(o, ['lines'], 'lab_intro', iss);
      const lines = strList(o.lines, 'lab_intro.lines', iss, { min: 1, max: 6, item: 120 });
      return done(lines ? { lines } : undefined);
    }
    case 'lab_page': {
      keysOk(o, ['eyebrow', 'note', 'projectsLinkLabel'], 'lab_page', iss);
      const eyebrow = str(o, 'eyebrow', 'lab_page', iss, 80);
      const note = str(o, 'note', 'lab_page', iss, 200);
      const projectsLinkLabel = str(o, 'projectsLinkLabel', 'lab_page', iss, 40);
      return done(eyebrow && note && projectsLinkLabel ? { eyebrow, note, projectsLinkLabel } : undefined);
    }
    case 'notes_page': {
      keysOk(o, ['eyebrow', 'intro'], 'notes_page', iss);
      const eyebrow = str(o, 'eyebrow', 'notes_page', iss, 80);
      const intro = str(o, 'intro', 'notes_page', iss, 300);
      return done(eyebrow && intro ? { eyebrow, intro } : undefined);
    }
    case 'lab_categories': {
      keysOk(o, ['items'], 'lab_categories', iss);
      const items: LabCategory[] = [];
      if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 8) iss.add('lab_categories.items', '1–8 kategori olmalı');
      else
        o.items.forEach((it, i) => {
          const p = `lab_categories.items[${i}]`;
          if (!isObj(it)) return void iss.add(p, 'nesne olmalı');
          keysOk(it, ['id', 'label', 'accent'], p, iss);
          const id = idOf(it, p, iss);
          const label = str(it, 'label', p, iss, 30);
          const accent = accentOf(it, p, iss);
          if (id && label && accent) items.push({ id, label, accent });
        });
      uniqueIds(items.map((i) => i.id), 'lab_categories.items', iss);
      return done({ items });
    }
  }
}

/** JSON editörü: metin → doğrulanmış belge. Ham ayrıntı sızdırmaz. */
export function validateSiteJson(key: SiteContentKey, text: string): ValidationResult<SiteDoc> {
  const t = text.trim();
  if (!t) return { ok: false, errors: { json: 'JSON boş olamaz.' } };
  if (t.length > SITE_LIMITS.json) return { ok: false, errors: { json: `JSON en fazla ${SITE_LIMITS.json.toLocaleString('tr-TR')} karakter olabilir.` } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return { ok: false, errors: { json: 'Geçersiz JSON: sözdizimi hatası (virgül, tırnak veya parantezleri kontrol edin).' } };
  }
  const r = validateSiteDoc(key, parsed);
  return r.ok ? { ok: true, value: r.value } : { ok: false, errors: { json: r.error } };
}

/* ───────────── Kullanıcı dostu formlar: ham alanlar → belge ───────────── */

export type SiteRaw = Record<string, string | undefined>;
const lines = (v: string | undefined): string[] =>
  clean(v)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Satır numaralı alan hatalarını form alanlarına eşler. */
function mapErrors(iss: string, fieldFor: (path: string) => string, errors: Errors, fallback: string) {
  for (const part of iss.split(' · ')) {
    const path = part.slice(0, part.indexOf(':'));
    const msg = part.slice(part.indexOf(':') + 2);
    const f = fieldFor(path);
    if (!errors[f]) errors[f] = msg;
  }
  if (!Object.keys(errors).length) errors._form = fallback;
}

export const CURRENTLY_ROWS = SITE_LIMITS.currentlyRows;

export function buildFriendlyDoc(key: FriendlySiteKey, raw: SiteRaw): Obj {
  switch (key) {
    case 'hero':
      return {
        eyebrow: clean(raw.eyebrow), first: clean(raw.first), last: clean(raw.last), roles: clean(raw.roles),
        message: lines(raw.message),
        ctaPrimary: { label: clean(raw.cta_primary_label), href: clean(raw.cta_primary_href) },
        ctaSecondary: { label: clean(raw.cta_secondary_label), href: clean(raw.cta_secondary_href) },
        concepts: lines(raw.concepts),
      };
    case 'currently': {
      const items: Obj[] = [];
      for (let i = 1; i <= CURRENTLY_ROWS; i++) {
        const label = clean(raw[`label_${i}`]);
        const value = clean(raw[`value_${i}`]);
        if (!label && !value) continue; // boş satırlar yok sayılır
        const given = clean(raw[`item_id_${i}`]);
        items.push({ id: given, label, value, accent: clean(raw[`accent_${i}`]) || 'blue', __row: i });
      }
      return { items };
    }
    case 'about': {
      const img = clean(raw.image_media_id);
      return { title: clean(raw.title), text: clean(raw.text), ...(img ? { imageMediaId: img } : {}) };
    }
    case 'contact':
      return { title: lines(raw.title), lines: lines(raw.lines), cta: { label: clean(raw.cta_label), href: clean(raw.cta_href) } };
  }
}

/** Boş kimlikleri etiketten üretir (mevcut kimlikler korunur); çakışmaları sayıyla ayırır. */
function assignIds(items: Obj[]) {
  const used = new Set(items.map((i) => String(i.id)).filter(Boolean));
  for (const it of items) {
    if (it.id) continue;
    const base = String(it.label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'madde';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    it.id = id;
  }
}

export function validateSiteFriendly(key: FriendlySiteKey, raw: SiteRaw): ValidationResult<SiteDoc> {
  const built = buildFriendlyDoc(key, raw);
  let rowOf: Map<number, number> | null = null;
  if (key === 'currently' && Array.isArray(built.items)) {
    const items = built.items as Obj[];
    assignIds(items);
    rowOf = new Map(items.map((it, idx) => [idx, Number(it.__row)]));
    for (const it of items) delete it.__row;
  }
  const r = validateSiteDoc(key, built);
  if (r.ok) return { ok: true, value: r.value };

  const errors: Errors = {};
  const fieldFor = (path: string): string => {
    const m = /^currently\.items\[(\d+)\]\.(\w+)/.exec(path);
    if (m && rowOf) return `${m[2] === 'value' ? 'value' : m[2] === 'accent' ? 'accent' : 'label'}_${rowOf.get(Number(m[1])) ?? 1}`;
    const map: Record<string, string> = {
      'hero.eyebrow': 'eyebrow', 'hero.first': 'first', 'hero.last': 'last', 'hero.roles': 'roles', 'hero.message': 'message',
      'hero.ctaPrimary.label': 'cta_primary_label', 'hero.ctaPrimary.href': 'cta_primary_href',
      'hero.ctaSecondary.label': 'cta_secondary_label', 'hero.ctaSecondary.href': 'cta_secondary_href', 'hero.concepts': 'concepts',
      'about.title': 'title', 'about.text': 'text', 'about.imageMediaId': 'image_media_id',
      'contact.title': 'title', 'contact.lines': 'lines', 'contact.cta.label': 'cta_label', 'contact.cta.href': 'cta_href',
      'currently.items': 'label_1',
    };
    const base = path.replace(/\[\d+\]/g, '');
    return map[base] ?? '_form';
  };
  mapErrors(r.error, fieldFor, errors, 'Form geçersiz.');
  return { ok: false, errors };
}

/** İşlem için okunacak form alanları (allowlist): bilinmeyen alanlar (rol, isAdmin vb.) yok sayılır. */
export const SITE_FIELDS: Record<SiteContentKey, readonly string[]> = {
  hero: ['eyebrow', 'first', 'last', 'roles', 'message', 'cta_primary_label', 'cta_primary_href', 'cta_secondary_label', 'cta_secondary_href', 'concepts'],
  currently: Array.from({ length: CURRENTLY_ROWS }, (_, i) => [`item_id_${i + 1}`, `label_${i + 1}`, `value_${i + 1}`, `accent_${i + 1}`]).flat(),
  about: ['title', 'text', 'image_media_id'],
  contact: ['title', 'lines', 'cta_label', 'cta_href'],
  site_meta: ['json'], social: ['json'], lab_intro: ['json'], lab_page: ['json'], notes_page: ['json'], lab_categories: ['json'],
};

export function validateSiteInput(key: SiteContentKey, raw: SiteRaw): ValidationResult<SiteDoc> {
  return isFriendlyKey(key) ? validateSiteFriendly(key, raw) : validateSiteJson(key, raw.json ?? '');
}
