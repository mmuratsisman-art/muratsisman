/**
 * Mevcut dosya tabanlı içeriğin (src/data/*) FAZ 3A veritabanı şemasına KAYIPSIZ sığdığını doğrular.
 * Veritabanına bağlanmaz, hiçbir şeyi değiştirmez.
 *
 * Çalıştırma (isteğe bağlı araç; projeye bağımlılık eklemez):
 *   npx tsx scripts/cms/verify-roundtrip.ts
 *
 * Kontroller:
 *   1. içerik → satır → (JSON/jsonb simülasyonu) → içerik  ==  orijinal  (deepStrictEqual)
 *   2. satırlar SQL CHECK kısıtlarının sözlüğüne uyuyor (accent, size, graphic, kind, type, status, slug biçimi, jsonb tipleri)
 *   3. slug'lar benzersiz
 */
import assert from 'node:assert/strict';
import { projects } from '@/data/projects';
import { labCategories, labEntries } from '@/data/lab';
import { notes } from '@/data/notes';
import { siteConfig } from '@/data/site';
import { currently } from '@/data/currently';
import { socialLinks } from '@/data/social';
import {
  documentsToSiteContent,
  labEntryToInsert,
  noteToInsert,
  projectToInsert,
  recordToLabEntry,
  recordToNote,
  recordToProject,
  siteContentToDocuments,
} from '@/lib/cms/mappers';
import { SITE_CONTENT_KEYS, type LabEntryRecord, type NoteRecord, type ProjectRecord } from '@/lib/cms/types';
import { isValidSlug } from '@/lib/cms/status';

const STAMP = '2026-01-01T00:00:00Z';
const ACCENTS = ['blue', 'green', 'orange', 'purple'];
const SIZES = ['feature', 'standard', 'teaser'];
const GRAPHICS = ['rings', 'flow', 'nodes', 'dots'];
const KINDS = ['personal', 'work', 'ai-experiment'];
const LAB_TYPES = ['EXPERIMENT', 'PROTOTYPE', 'CONCEPT'];
const LAB_STATUSES = ['ACTIVE', 'EXPLORING', 'PAUSED', 'ARCHIVED'];

const extras = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  created_at: STAMP,
  updated_at: STAMP,
  created_by: null,
  updated_by: null,
});
const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const oneOf = (set: string[], v: string | null, what: string) => assert.ok(v === null || set.includes(v), `${what}: geçersiz değer ${String(v)}`);

let checks = 0;
const ok = (label: string) => {
  checks += 1;
  console.log(`  OK  ${label}`);
};

// ── Projects
const projectRecords: ProjectRecord[] = projects.map((p, i) => {
  const ins = projectToInsert(p, i, 'published');
  return viaJson({ ...ins, published_at: ins.published_at ?? STAMP, ...extras(i) });
});
projectRecords.forEach((r, i) => {
  assert.deepStrictEqual(recordToProject(r), projects[i], `project ${r.slug} kayıpsız dönmüyor`);
  assert.ok(isValidSlug(r.slug), `slug biçimi: ${r.slug}`);
  oneOf(ACCENTS, r.accent, 'projects.accent');
  oneOf(SIZES, r.size, 'projects.size');
  oneOf(GRAPHICS, r.graphic, 'projects.graphic');
  oneOf(KINDS, r.kind, 'projects.kind');
  oneOf(ACCENTS, r.project_status_accent, 'projects.project_status_accent');
  assert.equal(r.project_status_label === null, r.project_status_accent === null, 'projects_pill_pair');
  assert.ok(r.case_study === null || (typeof r.case_study === 'object' && !Array.isArray(r.case_study)), 'projects_case_study_object');
});
assert.equal(new Set(projectRecords.map((r) => r.slug)).size, projectRecords.length, 'proje slug çakışması');
ok(`projects: ${projectRecords.length} kayıt kayıpsız + kısıtlara uygun`);

// ── Lab
const labRecords: LabEntryRecord[] = labEntries.map((e, i) => {
  const ins = labEntryToInsert(e, i, 'published');
  return viaJson({ ...ins, published_at: ins.published_at ?? STAMP, ...extras(i) });
});
labRecords.forEach((r, i) => {
  assert.deepStrictEqual(recordToLabEntry(r), labEntries[i], `lab ${r.slug} kayıpsız dönmüyor`);
  assert.ok(isValidSlug(r.slug), `slug biçimi: ${r.slug}`);
  oneOf(ACCENTS, r.accent, 'lab_entries.accent');
  oneOf(LAB_TYPES, r.type, 'lab_entries.type');
  oneOf(LAB_STATUSES, r.experiment_status, 'lab_entries.experiment_status');
  assert.ok(typeof r.story === 'object' && !Array.isArray(r.story), 'lab_entries_story_object');
});
assert.equal(new Set(labRecords.map((r) => r.slug)).size, labRecords.length, 'lab slug çakışması');
ok(`lab_entries: ${labRecords.length} kayıt kayıpsız + kısıtlara uygun`);

// ── Notes
const noteRecords: NoteRecord[] = notes.map((n, i) => viaJson({ ...noteToInsert(n, 'published'), published_at: `${n.publishedAt}T00:00:00Z`, ...extras(i) }));
noteRecords.forEach((r, i) => {
  assert.deepStrictEqual(recordToNote(r), notes[i], `note ${r.slug} kayıpsız dönmüyor`);
  assert.ok(isValidSlug(r.slug), `slug biçimi: ${r.slug}`);
  oneOf(ACCENTS, r.accent, 'notes.accent');
  assert.ok(Array.isArray(r.content), 'notes_content_array');
});
assert.equal(new Set(noteRecords.map((r) => r.slug)).size, noteRecords.length, 'not slug çakışması');
ok(`notes: ${noteRecords.length} kayıt kayıpsız + kısıtlara uygun`);

// ── Site içeriği
const src = { siteConfig, currently, socialLinks, labCategories };
const docs = viaJson(siteContentToDocuments(src));
assert.deepStrictEqual(Object.keys(docs).sort(), [...SITE_CONTENT_KEYS].sort(), 'site_content anahtar kümesi SQL CHECK ile aynı olmalı');
for (const doc of Object.values(docs)) assert.ok(typeof doc === 'object' && doc !== null && !Array.isArray(doc), 'site_content_*_object');
assert.deepStrictEqual(documentsToSiteContent(docs), src, 'site içeriği kayıpsız dönmüyor');
ok(`site_content: ${SITE_CONTENT_KEYS.length} doküman kayıpsız (${SITE_CONTENT_KEYS.join(', ')})`);

console.log(`\nTÜM KONTROLLER GEÇTİ (${checks}/4): mevcut içerik FAZ 3A şemasına kayıpsız sığıyor.`);
