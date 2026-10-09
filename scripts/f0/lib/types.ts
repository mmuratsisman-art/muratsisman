export type Verdict = 'PASS' | 'FAIL' | 'NOT RUN';

/**
 * Her kontrol bir türe sahiptir:
 *  - infra  : düzeneğin bütünlüğü (guard, egress=0, sahte sunucu ihlali=0). FAIL → ölçüm GEÇERSİZ.
 *  - doc    : mevcut belgedeki (docs/cms/PUBLIC-CONTENT.md) iddia ile gözlenen davranış uyumu. FAIL → belge düzeltilmeli.
 *  - req    : sahibin gereksinimi (örn. "kesintide sınırsız eski içerik sunulmamalı"). FAIL → F1'de çözülecek BULGU (düzenek hatası değil).
 *  - info   : yalnızca gözlem; PASS/FAIL taşımaz.
 */
export type CheckKind = 'infra' | 'doc' | 'req' | 'info';

export interface Check {
  kind: CheckKind;
  name: string;
  expected: string;
  observed: string;
  verdict: Verdict;
}

export interface ScenarioResult {
  id: string;
  title: string;
  /** Senaryonun kendisi çalıştı mı: PASS = tamamlandı, NOT RUN = çalıştırılamadı/atlandı, FAIL = düzenek hatası (beklenmeyen istisna) */
  status: Verdict;
  checks: Check[];
  observations: string[];
  timeline?: string[][];
  notRunReason?: string;
}

export const check = (kind: CheckKind, name: string, expected: string, observed: string, ok: boolean): Check => ({
  kind, name, expected, observed, verdict: ok ? 'PASS' : 'FAIL',
});
export const info = (name: string, observed: string): Check => ({ kind: 'info', name, expected: '-', observed, verdict: 'PASS' });
