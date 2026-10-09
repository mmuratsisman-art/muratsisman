import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projects } from '../../../src/data/projects';
import { labEntries, labCategories } from '../../../src/data/lab';
import { notes } from '../../../src/data/notes';
import { siteConfig } from '../../../src/data/site';
import { currently } from '../../../src/data/currently';
import { socialLinks } from '../../../src/data/social';
import { noteToInsert, siteContentToDocuments } from '../../../src/lib/cms/mappers';
import type { CacheAdapter } from '../../../src/lib/content/cache';
import { ContentUnavailableError } from '../../../src/lib/content/errors';
import { createEnvelopeCache } from '../../../src/lib/content/envelope-cache';
import { createContentProvider, type StaticContent } from '../../../src/lib/content/provider';
import { supabaseReader, type QueryClient } from '../../../src/lib/content/reader';
import { fakeClock, fakeUnstableCache } from './helpers';

const staticContent: StaticContent = { projects, labEntries, notes, site: { siteConfig, currently, socialLinks, labCategories } };
type Row = Record<string, unknown>;
const siteRows = (): Row[] => Object.entries(siteContentToDocuments(staticContent.site)).map(([key, data]) => ({ key, data }));

/** Sahte Supabase (RLS: yalnızca status=published); sorgu sayısı ve kesinti anahtarı. */
function world() {
  const state = { notes: [{ ...noteToInsert(notes[0], 'published') } as Row], site: siteRows(), down: false, queries: 0 };
  const client = {
    from(table: string) {
      const rows = (): Row[] => (table === 'notes' ? state.notes : table === 'site_content_published' ? state.site : []);
      // Sorgu, SONUÇ tüketildiğinde (then) bir kez sayılır; select() ve eq() zincirleme çağrıları ayrı sorgu değildir.
      const lazy = (f?: [string, string]) => ({
        then: <A, B>(ok?: (v: { data: unknown[] | null; error: { code?: string } | null }) => A | PromiseLike<A>, bad?: (e: unknown) => B | PromiseLike<B>) => {
          state.queries += 1;
          const v = state.down ? { data: null, error: { code: 'PGRST301' } } : { data: f ? rows().filter((r) => r[f[0]] === f[1]) : rows(), error: null };
          return Promise.resolve(v).then(ok, bad);
        },
      });
      return { select: () => Object.assign(lazy(), { eq: (c: string, v: string) => lazy([c, v]) }) };
    },
  } as unknown as QueryClient;
  return { state, client };
}

function rig() {
  const clock = fakeClock(); const uc = fakeUnstableCache(clock); const w = world();
  const cache = createEnvelopeCache({ store: uc.store, softSeconds: 50, hardSeconds: 60, keyPrefix: 'k', baseTag: 'cms-public', now: clock.now });
  const provider = createContentProvider({ source: () => 'cms', reader: () => supabaseReader(w.client, { timeoutMs: 2000 }), cache, staticContent });
  return { clock, uc, w, provider, slug: String(w.state.notes[0].slug) };
}

test('M03 (uçtan uca): yayından kaldırılan not, TTL sonrası İLK istekte undefined (→ notFound/404); listede de yok', async () => {
  const r = rig();
  assert.ok(await r.provider.getNote(r.slug));
  r.w.state.notes = []; // kaynakta yayından kaldırıldı (RLS: published dışı dönmez)
  r.clock.advance(61_000);
  assert.equal(await r.provider.getNote(r.slug), undefined);
  assert.deepEqual(await r.provider.getNotes(), []);
});

test('M05 (uçtan uca): sert sınırdan sonra kesintide ContentUnavailableError; ASLA eski not ya da statik içerik', async () => {
  const r = rig();
  assert.ok(await r.provider.getNote(r.slug));
  r.w.state.down = true; r.w.state.notes = [];
  r.clock.advance(55_000);
  assert.ok(await r.provider.getNote(r.slug), 'sert sınırın içinde eski not (en çok 60 sn) kabul edilen davranış');
  r.clock.advance(6_000);
  await assert.rejects(() => r.provider.getNote(r.slug), (e) => e instanceof ContentUnavailableError && e.code === 'query');
  await assert.rejects(() => r.provider.getNotes(), ContentUnavailableError);
});

test('tek istekte (generateMetadata + sayfa + sonraki not) aynı veriden TEK sorgu grubu: eşzamanlı çağrılar paylaşılır', async () => {
  const r = rig();
  await Promise.all([r.provider.getNote(r.slug), r.provider.getNote(r.slug), r.provider.getNextNote(r.slug)]);
  const notesQueries = r.w.state.queries; // site belgesi çağrılmadı; yalnız notes
  assert.equal(notesQueries, 1);
});

test('STATİK mod: önbellek bağdaştırıcısına HİÇ dokunulmaz, içerik src/data ile birebir aynı', async () => {
  let wraps = 0;
  const spy: CacheAdapter = { wrap: (_k, _t, fn) => { wraps += 1; return fn; } };
  const w = world();
  const p = createContentProvider({ source: () => 'static', reader: () => { throw new Error('static modda okuyucu çağrılmamalı'); }, cache: spy, staticContent });
  assert.deepEqual(await p.getNotes(), notes);
  assert.deepEqual(await p.getProjects(), projects);
  assert.deepEqual(await p.getLabEntries(), labEntries);
  assert.deepEqual((await p.getSiteContent()).siteConfig, siteConfig);
  assert.equal(wraps, 0);
  assert.equal(w.state.queries, 0);
});
