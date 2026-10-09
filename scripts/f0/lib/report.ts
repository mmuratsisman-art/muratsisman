import type { Check, ScenarioResult, Verdict } from './types';

export interface RunMeta {
  runId: string;
  startedAt: string;
  finishedAt: string;
  node: string;
  platform: string;
  ttlSeconds: number;
  quick: boolean;
  mode: 'next' | 'mock';
  fakeUrl: string;
  notes: string[];
}

const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const icon = (v: Verdict): string => v;

export function summarize(results: ScenarioResult[]) {
  const all: Check[] = results.flatMap((r) => r.checks);
  const by = (kind: Check['kind'], v: Verdict): number => all.filter((c) => c.kind === kind && c.verdict === v).length;
  return {
    infraFail: by('infra', 'FAIL'), infraPass: by('infra', 'PASS'),
    docFail: by('doc', 'FAIL'), docPass: by('doc', 'PASS'), docNotRun: by('doc', 'NOT RUN'),
    reqFail: by('req', 'FAIL'), reqPass: by('req', 'PASS'),
    scenarioFail: results.filter((r) => r.status === 'FAIL').length,
    scenarioNotRun: results.filter((r) => r.status === 'NOT RUN').length,
    valid: all.filter((c) => c.kind === 'infra').every((c) => c.verdict === 'PASS') && !results.some((r) => r.status === 'FAIL'),
  };
}

export function renderMarkdown(meta: RunMeta, results: ScenarioResult[]): string {
  const s = summarize(results);
  const L: string[] = [];
  L.push(`# FAZ 3B-F0 — Ölçüm Sonuçları (${meta.mode === 'next' ? 'GERÇEK Next.js' : 'MOCK uygulama — Next davranışı DEĞİL'})`);
  L.push('');
  L.push(`- Çalıştırma: \`${meta.runId}\` · başlangıç ${meta.startedAt} · bitiş ${meta.finishedAt}`);
  L.push(`- Ortam: Node ${meta.node} · ${meta.platform} · TTL (cache.ts) ${meta.ttlSeconds} sn · hızlı mod: ${meta.quick ? 'evet' : 'hayır'}`);
  L.push(`- Sahte Supabase: ${meta.fakeUrl} (yalnız loopback). Gerçek Supabase'e istek GÖNDERİLMEDİ (kanıt: M10).`);
  for (const n of meta.notes) L.push(`- ${n}`);
  L.push('');
  L.push('## Okuma kılavuzu');
  L.push('- **infra**: düzenek bütünlüğü. FAIL → bu çalıştırmanın ölçümleri GEÇERSİZ.');
  L.push('- **doc**: mevcut belge (docs/cms/PUBLIC-CONTENT.md) iddiası ile gözlenen davranış. FAIL → belge/varsayım düzeltilmeli.');
  L.push('- **req**: sahibin gereksinimi. FAIL → F1’de çözülecek BULGU (düzenek hatası değildir).');
  L.push('- **info**: yalnızca gözlem. **NOT RUN**: çalıştırılamadı (PASS sayılmaz).');
  L.push('');
  L.push('## Özet');
  L.push(`- Düzenek geçerli: **${s.valid ? 'EVET' : 'HAYIR'}** (infra PASS ${s.infraPass}, FAIL ${s.infraFail}; senaryo istisnası ${s.scenarioFail})`);
  L.push(`- Belge iddiaları: PASS ${s.docPass} · FAIL ${s.docFail} · NOT RUN ${s.docNotRun}`);
  L.push(`- Gereksinimler: PASS ${s.reqPass} · **FAIL ${s.reqFail}** (bulgu)`);
  L.push(`- Çalıştırılmayan senaryo: ${s.scenarioNotRun}`);
  L.push('');
  L.push('| Senaryo | Durum | doc FAIL | req FAIL | Başlık |');
  L.push('|---|---|---|---|---|');
  for (const r of results) {
    L.push(`| ${r.id} | ${icon(r.status)} | ${r.checks.filter((c) => c.kind === 'doc' && c.verdict === 'FAIL').length} | ${r.checks.filter((c) => c.kind === 'req' && c.verdict === 'FAIL').length} | ${esc(r.title)} |`);
  }
  for (const r of results) {
    L.push('');
    L.push(`## ${r.id} — ${r.title} — ${r.status}`);
    if (r.notRunReason) L.push(`NOT RUN nedeni: ${r.notRunReason}`);
    if (r.checks.length) {
      L.push('');
      L.push('| Tür | Kontrol | Beklenen | Gözlenen | Sonuç |');
      L.push('|---|---|---|---|---|');
      for (const c of r.checks) L.push(`| ${c.kind} | ${esc(c.name)} | ${esc(c.expected)} | ${esc(c.observed)} | ${c.kind === 'info' ? '—' : c.verdict} |`);
    }
    if (r.timeline) {
      L.push('');
      L.push('Zaman çizelgesi:');
      L.push('');
      L.push('| ' + r.timeline[0].join(' | ') + ' |');
      L.push('|' + r.timeline[0].map(() => '---').join('|') + '|');
      for (const row of r.timeline.slice(1)) L.push('| ' + row.map(esc).join(' | ') + ' |');
    }
    for (const o of r.observations) L.push(`- ${o}`);
  }
  L.push('');
  L.push('## Kapsam dışı bağlantı yolları (güvenlik kontrollerinin KAPSAMADIĞI yerler)');
  L.push('- Alt süreç olarak başlatılan harici programlar (curl, git, ssh vb.): guard yalnızca Node süreçlerinin ağ API’lerini kapsar.');
  L.push('- Yerel (native) Node eklentileri ve doğrudan UDP (dgram) soketleri.');
  L.push('- Unix soketleri / Windows adlandırılmış boruları: yerel IPC sayılır, "local-ipc" olarak günlüğe yazılır, engellenmez.');
  L.push('- İşletim sistemi düzeyinde ağ yalıtımı (Docker/network namespace) yoktur; garanti yazılım düzeyindedir.');
  L.push('- Vercel Data Cache, serverless arka plan yenilemesi ve çok bölgeli davranış yerelde ÖLÇÜLEMEZ (F4).');
  return L.join('\n');
}
