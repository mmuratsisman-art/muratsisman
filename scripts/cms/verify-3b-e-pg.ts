/**
 * FAZ 3B-E — public okuma katmanı, GERÇEK PostgreSQL şeması + RLS üzerinde (anon rolü). Yerel, geçici küme; üretim DB'sine ASLA bağlanmaz.
 * Doğrular: PROJECT_COLS/LAB_COLS/NOTE_COLS/SITE_COLS gerçekten var olan kolonlar mı; anon yalnız published satırları görür;
 * taslak tablolara erişemez; yazamaz. Ortam: PG_TEST_HOST, PG_TEST_PORT, [PG_TEST_USER] (bkz. run-3b-e-tests.sh).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { projects } from '@/data/projects';
import { labEntries } from '@/data/lab';
import { notes } from '@/data/notes';
import { projectToInsert, labEntryToInsert, noteToInsert } from '@/lib/cms/mappers';
import { createContentProvider } from '@/lib/content/provider';
import { noCache } from '@/lib/content/cache';
import { supabaseReader, type QueryClient } from '@/lib/content/reader';
import { staticContent } from '@/lib/content/static';
import { runner } from './test-harness';
import { buildTemplate, pgEnv, scenarioDb } from './import/test-support';

const env = pgEnv();
if (!env) {
  console.log('ATLANDI: PG_TEST_HOST/PG_TEST_PORT tanımlı değil. Bu testler ÇALIŞTIRILMADI (PASS sayılmaz).');
  process.exit(0);
}
const { check, finish } = runner();
type Row = Record<string, unknown>;
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;

async function main() {
  const tmpl = buildTemplate(env!, 'muratlab_3be_tmpl');
  const d = scenarioDb(env!, tmpl);
  try {
    const ins = (table: string, rows: Row[]) => {
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      d.sql(`insert into public.${table} (${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_recordset(null::public.${table}, ${lit(rows)}::jsonb);`);
    };
    const PUB = '2026-01-01T00:00:00Z';
    // projeler: p0,p1 published (aynı sort_order=7 → tie), p2 draft
    ins('projects', [
      { ...projectToInsert(projects[0], 7, 'published'), slug: 'tie-b', title: 'Aynı', published_at: PUB },
      { ...projectToInsert(projects[1], 7, 'published'), slug: 'tie-a', title: 'Aynı', published_at: PUB },
      { ...projectToInsert(projects[2], 1, 'draft'), slug: 'gizli-proje', title: 'GİZLİ TASLAK' },
    ]);
    ins('lab_entries', [
      { ...labEntryToInsert(labEntries[0], 1, 'published'), slug: 'lab-pub', published_at: PUB },
      { ...labEntryToInsert(labEntries[1], 2, 'draft'), slug: 'lab-draft' },
      { ...labEntryToInsert(labEntries[2], 3, 'preview'), slug: 'lab-preview' },
    ]);
    ins('notes', [
      { ...noteToInsert(notes[0], 'published'), slug: 'note-pub', published_at: '2026-02-01T00:00:00Z' },
      { ...noteToInsert(notes[1], 'published'), slug: 'note-pub2', published_at: '2026-02-01T00:00:00Z' },
      { ...noteToInsert(notes[2], 'draft'), slug: 'note-draft', published_at: null },
    ]);

    /** QueryClient → gerçek PG, anon rolüyle. */
    const anonClient: QueryClient = {
      from: (table) => ({
        select: (cols) => {
          const run = (where: string) => {
            try {
              const out = execFileSync('psql', ['-h', env!.host, '-p', String(env!.port), '-U', env!.superUser, '-d', d.db, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], {
                input: `begin;\nset local role anon;\nselect coalesce(jsonb_agg(t),'[]') from (select ${cols} from public.${table} ${where}) t;\ncommit;`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
              });
              const line = out.split('\n').filter((l) => l.startsWith('[')).pop() ?? '[]';
              return { data: JSON.parse(line) as unknown[], error: null };
            } catch (e) {
              const m = /ERROR:\s+([^\n]*)/.exec((e as { stderr?: string }).stderr ?? '');
              return { data: null, error: { code: m ? m[1].slice(0, 60) : 'unknown' } };
            }
          };
          const p = Promise.resolve(run(''));
          return Object.assign(p, { eq: (col: string, v: string) => Promise.resolve(run(`where ${col} = '${v.replace(/'/g, "''")}'`)) });
        },
      }),
    };
    const mk = (client: QueryClient) => createContentProvider({ source: () => 'cms', reader: () => supabaseReader(client), cache: noCache, staticContent });

    await check('P1 gerçek şemada kolon listeleri geçerli; anon yalnız published proje/lab/not görür', async () => {
      const p = mk(anonClient);
      assert.deepEqual((await p.getProjects()).map((x) => x.slug), ['tie-a', 'tie-b']); // eşit sort_order+başlık → slug
      assert.deepEqual((await p.getLabEntries()).map((x) => x.slug), ['lab-pub']);
      assert.deepEqual((await p.getNotes()).map((x) => x.slug), ['note-pub', 'note-pub2']); // eşit published_at → slug
    });
    await check('P2 draft/preview slug\'ları detayda da yok (undefined → 404)', async () => {
      const p = mk(anonClient);
      assert.equal(await p.getProject('gizli-proje'), undefined);
      assert.equal(await p.getLabEntry('lab-draft'), undefined);
      assert.equal(await p.getLabEntry('lab-preview'), undefined);
      assert.equal(await p.getNote('note-draft'), undefined);
    });
    await check('P3 SAVUNMA: sorguda status filtresi OLMASA bile RLS anon\'a draft/preview döndürmez', async () => {
      const raw = anonClient.from('projects').select('slug, status');
      const res = await raw;
      assert.ok(res.data && res.data.length === 2 && res.data.every((r) => (r as Row).status === 'published'));
      const lab = await anonClient.from('lab_entries').select('slug, status');
      assert.deepEqual((lab.data as Row[]).map((r) => r.slug), ['lab-pub']);
    });
    await check('P4 anon taslak tablolara erişemez (izin hatası), draft verisi public okumadan sızmaz', async () => {
      for (const t of ['project_drafts', 'lab_entry_drafts', 'note_drafts', 'site_content_drafts']) {
        const r = await anonClient.from(t).select('*');
        assert.ok(r.error, `${t} anon'a açık!`);
      }
      assert.ok(!JSON.stringify(await mk(anonClient).getProjects()).includes('GİZLİ'));
    });
    await check('P5 anon yazamaz ve yayınlayamaz', () => {
      for (const q of [
        "insert into public.notes (slug,title,excerpt,content,tags,accent,status) values ('x','x','x','[]','{}','blue','draft')",
        "update public.projects set title='x'",
        "delete from public.notes",
        "select public.publish_note('00000000-0000-0000-0000-000000000000')",
      ]) {
        const r = d.try(`begin;\nset local role anon;\n${q};\ncommit;`);
        assert.equal(r.ok, false, q);
      }
    });
    await check('P6 yayından kaldırma: unpublish sonrası anon okumasından kaybolur (RLS + filtre)', async () => {
      d.sql("update public.notes set status='draft', published_at=null where slug='note-pub2';");
      assert.deepEqual((await mk(anonClient).getNotes()).map((x) => x.slug), ['note-pub']);
      assert.equal(await mk(anonClient).getNote('note-pub2'), undefined);
    });
    await check('P7 site_content_published boş (import yok) → "invalid" hatası; statikle karışmaz', async () => {
      await assert.rejects(() => mk(anonClient).getSiteContent(), /kullanılamıyor \(invalid\)/);
    });
  } finally {
    d.drop();
  }
  finish('Tüm 3B-E PG kontrolleri geçti.');
}
main().catch((e) => { console.error(e); process.exit(1); });
