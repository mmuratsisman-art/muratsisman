import type { Accent, CaseDiagram, CaseSectionData, CaseStudy, DiagramKind, FeaturedCaseData, ListItem } from '@/types';
import { isAccent } from './common';
import { isObj, Issues, keysOk, str, strList, type Obj } from './schema';

/**
 * case_study için SUNUCU TARAFI şekil doğrulaması (bağımlılıksız). Geçersiz JSON/şekil ASLA veritabanına gitmez.
 * Çıktı, girdinin kopyası değil, doğrulanmış alanlardan yeniden kurulan nesnedir (bilinmeyen alanlar reddedilir, sızmaz).
 * Mevcut public modeli (`CaseStudy` in src/types) birebir korur: gerçek 3 proje bu doğrulayıcıdan değişmeden geçer.
 */

export const CASE_LIMITS = { json: 80_000, sections: 40, tags: 30, cases: 10, steps: 8, minSteps: 2, chips: 6, paragraphs: 20, items: 30 } as const;

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DIAGRAM_KINDS: readonly DiagramKind[] = ['commerce', 'migration', 'ai-assist'];

function section(v: unknown, path: string, iss: Issues): CaseSectionData | undefined {
  if (!isObj(v)) return void iss.add(path, 'nesne olmalı');
  const kind = v.kind;
  if (kind === 'prose') {
    keysOk(v, ['id', 'heading', 'kind', 'body'], path, iss);
    const id = idField(v, path, iss);
    const heading = str(v, 'heading', path, iss, 80);
    const body = strList(v.body, `${path}.body`, iss, { min: 1, max: CASE_LIMITS.paragraphs, item: 3000 });
    return id && heading && body ? { id, heading, kind: 'prose', body } : undefined;
  }
  if (kind === 'list') {
    keysOk(v, ['id', 'heading', 'kind', 'variant', 'items'], path, iss);
    const id = idField(v, path, iss);
    const heading = str(v, 'heading', path, iss, 80);
    let variant: 'grid' | 'numbered' | undefined;
    if (v.variant !== undefined) {
      if (v.variant === 'grid' || v.variant === 'numbered') variant = v.variant;
      else iss.add(`${path}.variant`, '"grid" veya "numbered" olmalı');
    }
    const items: ListItem[] = [];
    if (!Array.isArray(v.items) || v.items.length < 1 || v.items.length > CASE_LIMITS.items) iss.add(`${path}.items`, `1–${CASE_LIMITS.items} öğe olmalı`);
    else
      v.items.forEach((it, i) => {
        const p = `${path}.items[${i}]`;
        if (!isObj(it)) return void iss.add(p, 'nesne olmalı');
        keysOk(it, ['title', 'text'], p, iss);
        const title = str(it, 'title', p, iss, 120);
        const text = str(it, 'text', p, iss, 1000);
        if (title && text) items.push({ title, text });
      });
    if (!id || !heading || iss.any) return undefined;
    return variant ? { id, heading, kind: 'list', variant, items } : { id, heading, kind: 'list', items };
  }
  iss.add(`${path}.kind`, '"prose" veya "list" olmalı');
  return undefined;
}
function idField(o: Obj, path: string, iss: Issues): string | undefined {
  const v = o.id;
  if (typeof v !== 'string' || !ID.test(v)) return void iss.add(`${path}.id`, 'küçük harf/rakam/tire içeren kısa bir kimlik olmalı');
  return v;
}

function sections(v: unknown, path: string, iss: Issues): CaseSectionData[] | undefined {
  if (!Array.isArray(v) || v.length < 1 || v.length > CASE_LIMITS.sections) return void iss.add(path, `1–${CASE_LIMITS.sections} bölüm olmalı`);
  const out: CaseSectionData[] = [];
  const seen = new Set<string>();
  v.forEach((s, i) => {
    const r = section(s, `${path}[${i}]`, iss);
    if (!r) return;
    if (seen.has(r.id)) iss.add(`${path}[${i}].id`, `"${r.id}" kimliği tekrar ediyor`);
    seen.add(r.id);
    out.push(r);
  });
  return out;
}

function diagram(v: unknown, path: string, iss: Issues): CaseDiagram | undefined {
  if (!isObj(v)) return void iss.add(path, 'nesne olmalı');
  keysOk(v, ['kind', 'heading', 'steps'], path, iss);
  const kind = v.kind;
  if (typeof kind !== 'string' || !(DIAGRAM_KINDS as readonly string[]).includes(kind)) iss.add(`${path}.kind`, `${DIAGRAM_KINDS.join(' | ')} olmalı`);
  const heading = str(v, 'heading', path, iss, 80);
  const steps: CaseDiagram['steps'] = [];
  if (!Array.isArray(v.steps) || v.steps.length < CASE_LIMITS.minSteps || v.steps.length > CASE_LIMITS.steps) iss.add(`${path}.steps`, `${CASE_LIMITS.minSteps}–${CASE_LIMITS.steps} adım olmalı`);
  else
    v.steps.forEach((s, i) => {
      const p = `${path}.steps[${i}]`;
      if (!isObj(s)) return void iss.add(p, 'nesne olmalı');
      keysOk(s, ['label', 'caption', 'chips'], p, iss);
      const label = str(s, 'label', p, iss, 60);
      const caption = str(s, 'caption', p, iss, 300);
      let chips: string[] | undefined;
      if (s.chips !== undefined) chips = strList(s.chips, `${p}.chips`, iss, { min: 1, max: CASE_LIMITS.chips, item: 30 });
      if (label && caption) steps.push(chips ? { label, caption, chips } : { label, caption });
    });
  if (!heading || typeof kind !== 'string' || !(DIAGRAM_KINDS as readonly string[]).includes(kind) || iss.any) return undefined;
  return { kind: kind as DiagramKind, heading, steps };
}

function featured(v: unknown, path: string, iss: Issues): FeaturedCaseData | undefined {
  if (!isObj(v)) return void iss.add(path, 'nesne olmalı');
  keysOk(v, ['id', 'name', 'typeLabel', 'accent', 'summary', 'sections', 'diagram', 'diagramAfter', 'tags', 'note'], path, iss);
  const id = idField(v, path, iss);
  const name = str(v, 'name', path, iss, 60);
  const typeLabel = str(v, 'typeLabel', path, iss, 60);
  const accentRaw = v.accent;
  if (typeof accentRaw !== 'string' || !isAccent(accentRaw)) iss.add(`${path}.accent`, 'blue | green | orange | purple olmalı');
  const summary = v.summary === undefined ? undefined : str(v, 'summary', path, iss, 600);
  const secs = sections(v.sections, `${path}.sections`, iss);
  const dia = diagram(v.diagram, `${path}.diagram`, iss);
  const after = str(v, 'diagramAfter', path, iss, 40);
  const tags = strList(v.tags, `${path}.tags`, iss, { min: 0, max: CASE_LIMITS.tags, item: 40 });
  const note = v.note === undefined ? undefined : str(v, 'note', path, iss, 300);
  if (secs && after && !secs.some((s) => s.id === after)) iss.add(`${path}.diagramAfter`, `"${after}" adlı bir bölüm yok`);
  if (!id || !name || !typeLabel || typeof accentRaw !== 'string' || !isAccent(accentRaw) || !secs || !dia || !after || !tags || iss.any) return undefined;
  const out: FeaturedCaseData = { id, name, typeLabel, accent: accentRaw as Accent, sections: secs, diagram: dia, diagramAfter: after, tags };
  if (summary !== undefined) out.summary = summary;
  if (note !== undefined) out.note = note;
  return out;
}

/** Doğrulanmış CaseStudy veya anlaşılır (Türkçe) hata metni. */
export function validateCaseStudy(value: unknown): { ok: true; value: CaseStudy } | { ok: false; error: string } {
  const iss = new Issues();
  if (!isObj(value)) return { ok: false, error: 'case_study bir nesne ({ ... }) olmalı.' };
  keysOk(value, ['sections', 'tagsHeading', 'tags', 'diagram', 'cases', 'slots'], 'case_study', iss);

  const secs = sections(value.sections, 'case_study.sections', iss);
  const tags = strList(value.tags, 'case_study.tags', iss, { min: 0, max: CASE_LIMITS.tags, item: 40 });
  const tagsHeading = value.tagsHeading === undefined ? undefined : str(value, 'tagsHeading', 'case_study', iss, 60);
  const dia = value.diagram === undefined ? undefined : diagram(value.diagram, 'case_study.diagram', iss);

  let cases: FeaturedCaseData[] | undefined;
  if (value.cases !== undefined) {
    if (!Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > CASE_LIMITS.cases) iss.add('case_study.cases', `1–${CASE_LIMITS.cases} vaka olmalı`);
    else {
      cases = [];
      const seen = new Set<string>();
      value.cases.forEach((c, i) => {
        const r = featured(c, `case_study.cases[${i}]`, iss);
        if (!r) return;
        if (seen.has(r.id)) iss.add(`case_study.cases[${i}].id`, `"${r.id}" kimliği tekrar ediyor`);
        seen.add(r.id);
        cases?.push(r);
      });
    }
  }

  let slots: CaseStudy['slots'];
  if (value.slots !== undefined) {
    if (!isObj(value.slots)) iss.add('case_study.slots', 'nesne olmalı');
    else {
      keysOk(value.slots, ['diagramAfter', 'casesAfter'], 'case_study.slots', iss);
      const s: NonNullable<CaseStudy['slots']> = {};
      for (const k of ['diagramAfter', 'casesAfter'] as const) {
        const raw = value.slots[k];
        if (raw === undefined) continue;
        if (typeof raw !== 'string' || !secs?.some((x) => x.id === raw)) iss.add(`case_study.slots.${k}`, 'mevcut bir bölüm kimliği olmalı');
        else s[k] = raw;
      }
      slots = s;
    }
  }

  if (!secs || !tags || iss.any) return { ok: false, error: iss.text() || 'case_study geçersiz.' };
  const out: CaseStudy = { sections: secs, tags };
  if (tagsHeading !== undefined) out.tagsHeading = tagsHeading;
  if (dia) out.diagram = dia;
  if (cases) out.cases = cases;
  if (slots) out.slots = slots;
  return { ok: true, value: out };
}

/** Metin → CaseStudy | null (boş = null). JSON sözdizimi hatası ve şekil hatası Türkçe, ham ayrıntı sızdırmadan döner. */
export function parseCaseStudyText(text: string): { ok: true; value: CaseStudy | null } | { ok: false; error: string } {
  const t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > CASE_LIMITS.json) return { ok: false, error: `case_study en fazla ${CASE_LIMITS.json.toLocaleString('tr-TR')} karakter olabilir.` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return { ok: false, error: 'Geçersiz JSON: sözdizimi hatası (virgül, tırnak veya parantezleri kontrol edin).' };
  }
  return validateCaseStudy(parsed);
}
