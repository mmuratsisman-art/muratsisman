/**
 * PROJE VİTRİNİ 2.0 / FAZ 1B REGRESYON TESTİ. Next, Supabase ve veritabanı GEREKMEZ (saf fonksiyon + kaynak taraması).
 *
 *   npx tsx scripts/cms/verify-project-kind.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectKind } from '@/types';
import { PROJECT_KIND_LABEL, isDerivedKindLabel, projectKindLabel } from '@/lib/project-kind';
import { PROJECT_KINDS } from '@/lib/cms/validate/projects';
import { projects } from '@/data/projects';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}: ${(e as Error).message}`); }
}
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function yes(c: unknown, m: string) { if (!c) throw new Error(m); }

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const card = read('src/components/ui/ProjectCard.tsx');
const hero = read('src/components/project/ProjectHero.tsx');
const helper = read('src/lib/project-kind.ts');
const bySlug = (s: string) => projects.find((p) => p.slug === s)!;

// ── saf mantık ──
check('K1 ProjectKind kümesi değişmedi', () => eq([...PROJECT_KINDS], ['personal', 'work', 'ai-experiment'], 'kinds'));
check('K2 etiket haritası: personal/work/ai-experiment', () => {
  eq(PROJECT_KIND_LABEL.personal, 'Personal', 'personal');
  eq(PROJECT_KIND_LABEL.work, 'Work', 'work');
  eq(PROJECT_KIND_LABEL['ai-experiment'], 'Experiment', 'ai-experiment');
});
check('K3 her ProjectKind için boş olmayan etiket (tüm kümeyi kapsar)', () => {
  for (const k of PROJECT_KINDS as readonly ProjectKind[]) yes(projectKindLabel({ kind: k }), `etiket yok: ${k}`);
  eq(Object.keys(PROJECT_KIND_LABEL).sort(), [...PROJECT_KINDS].sort(), 'harita anahtarları');
});
check('K4 kind varsa türetilmiş etiket typeLabel\'i ezer', () => eq(projectKindLabel({ kind: 'work', typeLabel: 'ÖZEL METİN' }), 'Work', 'derived'));
check('K5 kind yoksa typeLabel\'e düşer', () => {
  eq(projectKindLabel({ typeLabel: 'CUSTOM LABEL' }), 'CUSTOM LABEL', 'undefined kind');
  eq(projectKindLabel({ kind: undefined, typeLabel: 'X' }), 'X', 'explicit undefined');
});
check('K6 kind ve typeLabel yoksa undefined', () => {
  eq(projectKindLabel({}), undefined, 'both missing');
  eq(projectKindLabel({ typeLabel: '' }), undefined, 'empty typeLabel');
});
check('K7 beklenmeyen çalışma zamanı kind değeri typeLabel\'e düşer (çökmez)', () => {
  eq(projectKindLabel({ kind: 'legacy' as unknown as ProjectKind, typeLabel: 'OLD' }), 'OLD', 'unknown with typeLabel');
  eq(projectKindLabel({ kind: 'legacy' as unknown as ProjectKind }), undefined, 'unknown without');
  eq(projectKindLabel({ kind: 'toString' as unknown as ProjectKind }), undefined, 'prototype key');
});
check('K7b isDerivedKindLabel: yalnız bilinen kind için true', () => {
  yes(isDerivedKindLabel({ kind: 'personal' }) && isDerivedKindLabel({ kind: 'work' }) && isDerivedKindLabel({ kind: 'ai-experiment' }), 'bilinen kind');
  yes(!isDerivedKindLabel({}) && !isDerivedKindLabel({ kind: 'legacy' as unknown as ProjectKind }), 'kind yok/bilinmeyen');
});
check('K8 statik projeler: türetilmiş etiketler', () => {
  eq(projectKindLabel(bySlug('yakala')), 'Personal', 'yakala');
  eq(projectKindLabel(bySlug('migration-center')), 'Work', 'migration-center');
  eq(projectKindLabel(bySlug('ai-lab')), 'Experiment', 'ai-lab');
});
check('K9 statik typeLabel / status.label verisi değişmedi', () => {
  eq(bySlug('yakala').typeLabel, 'PERSONAL PROJECT', 'yakala typeLabel');
  eq(bySlug('migration-center').typeLabel, 'WORK PROJECT', 'mc typeLabel');
  eq(bySlug('ai-lab').typeLabel, 'AI / EXPERIMENT', 'ai typeLabel');
  eq(bySlug('yakala').status?.label, 'ACTIVE DEVELOPMENT', 'yakala status');
  eq(bySlug('migration-center').status, undefined, 'mc status');
  eq(bySlug('ai-lab').status?.label, 'ONGOING', 'ai status');
});
check('K10 helper saf: yalnız tip import eder, veri/CMS/React yok', () => {
  const imports = helper.match(/^import .*$/gm) ?? [];
  yes(imports.length === 1 && /^import type .* from '@\/types';/.test(imports[0]), `importlar: ${imports.join(' | ')}`);
  yes(!/@\/data|lib\/cms|supabase|fetch\(|process\.env/.test(helper), 'yan etki/veri bağımlılığı');
});

// ── kart kaynağı ──
check('K11 kart türetilmiş etiketi kullanır, ham typeLabel basmaz', () => {
  yes(/from '@\/lib\/project-kind'/.test(card), 'import yok');
  yes(/projectKindLabel\(project\)/.test(card), 'çağrı yok');
  yes(!/project\.typeLabel/.test(card), 'ham typeLabel hâlâ kullanılıyor');
  yes(/<span lang=\{derivedKind \? 'en' : undefined\} className=\{derivedKind \? 'uppercase' : undefined\}>\{kindLabel\}<\/span>/.test(card), 'tür span\'ı (lang=en + uppercase yalnız türetilmişte) yok');
  yes(/isDerivedKindLabel\(project\)/.test(card), 'isDerivedKindLabel çağrısı yok');
});
check('K12 kart @/data/* import etmez (3B-E S3 ile uyumlu)', () => yes(!/from '@\/data/.test(card), '@/data import'));
check('K13 aria-label başlık + alt başlık + tür içerir', () => {
  yes(/aria-label=\{`\$\{project\.title\} — \$\{project\.subtitle\}\$\{kindLabel \? `, \$\{kindLabel\}` : ''\}`\}/.test(card), 'aria-label biçimi');
});
check('K14 coming-soon dalı değişmedi (div, link yok, SOON, tür yok)', () => {
  yes(/if \(project\.comingSoon\) \{\s*return <div className=\{base\} style=\{style\}>\{content\}<\/div>;\s*\}/.test(card), 'div dalı');
  yes(/project\.comingSoon \? 'SOON' : project\.index/.test(card), 'SOON');
  yes(/kindLabel && !project\.comingSoon/.test(card), 'tür coming-soon\'da gizli değil');
});
check('K15 kart düzeni korundu: link, ok butonu, ızgara sınıfları', () => {
  yes(/href=\{`\/projects\/\$\{project\.slug\}`\}/.test(card), 'link');
  yes(/h-11 w-11/.test(card), '44px ok butonu');
  yes(/md:col-span-7 md:row-span-2/.test(card) && /md:col-span-5/.test(card) && /md:col-span-12/.test(card), 'sizeClass');
  yes(/flex flex-wrap items-center gap-x-2/.test(card), 'meta grubu');
});
check('K16 ProjectHero değişmedi (hâlâ typeLabel)', () => yes(/\{project\.typeLabel\}/.test(hero), 'hero typeLabel'));
check('K17 yeni migration yok (0001–0007)', () => {
  const m = readdirSync(join(root, 'supabase/migrations')).filter((f) => !f.endsWith('_down.sql')).map((f) => f.slice(0, 4)).sort();
  eq(m, ['0001', '0002', '0003', '0004', '0005', '0006', '0007'], 'migrations');
});

if (failures.length) {
  console.error(`${passed} kontrol geçti, ${failures.length} başarısız.`);
  for (const f of failures) console.error(' ✗ ' + f);
  process.exit(1);
}
console.log(`${passed} kontrol geçti, 0 başarısız.`);
console.log('Tüm proje türü (FAZ 1B) kontrolleri geçti.');
