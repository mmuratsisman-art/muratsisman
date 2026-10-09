import type { ApplyResult } from './executor';
import type { RollbackPlan } from './rollback';
import type { VerifyReport } from './verify';
import type { Plan } from './types';
import { applyToken } from './planner';
import { rollbackToken } from './rollback';

const SEV = { blocker: 'ENGEL', warning: 'UYARI', info: 'bilgi' } as const;

export function renderPlanMarkdown(p: Plan, title = 'Import öncesi (dry-run) raporu'): string {
  const L: string[] = [];
  L.push(`# MURAT/LAB FAZ 3B-B — ${title}`, '');
  L.push(`- Araç sürümü: ${p.toolVersion} · Üretim: ${p.generatedAt} · Hedef anlık görüntü: ${p.snapshotCapturedAt}`);
  L.push(`- Kaynak özeti (sha256): \`${p.sourceDigest}\``, `- Plan özeti (sha256): \`${p.planDigest}\``);
  L.push(`- 0006 (provenance) hedefte: ${p.provenanceTable ? 'VAR' : 'YOK'}`, '');
  L.push('## Sayımlar', '', '| Kaynak kayıt | Hedefte mevcut (önce) | Eklenecek | Devam ettirilecek | Atlanacak | Çakışan | Doğrulanamayan |', '|---|---|---|---|---|---|---|');
  const c = p.counts;
  L.push(`| ${c.source} | ${c.targetBefore} | ${c.create} | ${c.resume} | ${c.skip} | ${c.conflict} | ${c.unverifiable} |`, '');
  L.push(`**Uygulanabilir: ${p.canApply ? 'EVET' : 'HAYIR'}**${p.canApply ? ` · Onay belirteci: \`${applyToken(p)}\`` : ''}`, '');
  if (p.blockers.length) { L.push('## Engeller (apply fail-closed)', '', ...p.blockers.map((b) => `- ${b}`), ''); }
  L.push('## Kayıtlar', '', '| Tür | Anahtar | Karar | SEO | Adımlar | Gerekçe |', '|---|---|---|---|---|---|');
  for (const i of p.items) L.push(`| ${i.kind} | ${i.key} | ${i.decision} | ${i.seo} | ${i.steps.length} | ${i.reasons.join('; ') || '-'} |`);
  L.push('');
  const cut = p.findings.filter((f) => f.cutoverBlocker);
  if (cut.length) { L.push('## 3B-E (cutover) ÖNCESİ çözülmesi gereken engeller', '', ...cut.map((f) => `- ${f.message}`), ''); }
  const rest = p.findings.filter((f) => !f.cutoverBlocker);
  if (rest.length) { L.push('## Bulgular', '', ...rest.map((f) => `- [${SEV[f.severity]}] ${f.code}: ${f.message}`), ''); }
  return L.join('\n');
}

export function renderVerifyMarkdown(v: VerifyReport, title = 'Import sonrası doğrulama raporu'): string {
  const L: string[] = [`# MURAT/LAB FAZ 3B-B — ${title}`, ''];
  L.push(`- Üretim: ${v.generatedAt} · Kaynak özeti: \`${v.sourceDigest}\``, `- **Sonuç: ${v.ok ? 'TÜM KAYITLAR DOĞRULANDI' : 'DOĞRULAMA BAŞARISIZ'}**`, '');
  const c = v.counts;
  L.push('| Kaynak | Hedefteki satır (yayınlanmış site belgeleri dahil) | OK | OK (sahiplenilmemiş, aynı) | Uyuşmayan | Eksik |', '|---|---|---|---|---|---|', `| ${c.source} | ${c.targetRows} | ${c.ok} | ${c.okUnmanaged} | ${c.mismatch} | ${c.missing} |`, '');
  L.push('| Tür | Anahtar | Durum | Başarısız kontroller |', '|---|---|---|---|');
  for (const r of v.records) L.push(`| ${r.kind} | ${r.key} | ${r.status} | ${r.checks.filter((k) => !k.ok).map((k) => `${k.name}${k.detail ? ` (${k.detail})` : ''}`).join('; ') || '-'} |`);
  L.push('');
  if (v.cutoverBlockers.length) L.push('## 3B-E (cutover) ÖNCESİ çözülmesi gereken engeller', '', ...v.cutoverBlockers.map((f) => `- ${f.message}`), '');
  if (v.ledgerFindings.length) L.push('## Provenance ↔ CMS tutarlılık bulguları', '', ...v.ledgerFindings.map((f) => `- [${SEV[f.severity]}] ${f.code}: ${f.message}`), '');
  else L.push('## Provenance ↔ CMS tutarlılık bulguları', '', '- Bulgu yok.', '');
  return L.join('\n');
}

export function renderApplyMarkdown(r: ApplyResult): string {
  const L: string[] = ['# MURAT/LAB FAZ 3B-B — Apply sonucu', ''];
  L.push(`- Sonuç: ${r.ok ? 'BAŞARILI' : 'BAŞARISIZ / DURDURULDU'}`, `- Koşu kimliği: ${r.runId ?? '-'}`);
  if (r.refused) L.push(`- **REDDEDİLDİ (hiçbir yazma yapılmadı):** ${r.refused}`);
  L.push('', '| Tür | Anahtar | Karar | Sonuç | Tamamlanan adımlar | Hata |', '|---|---|---|---|---|---|');
  for (const i of r.results) L.push(`| ${i.kind} | ${i.key} | ${i.decision} | ${i.outcome} | ${i.stepsDone.join('>') || '-'} | ${i.error ?? '-'} |`);
  L.push('');
  const n = (o: string) => r.results.filter((x) => x.outcome === o).length;
  L.push(`Eklenen: ${n('created')} · Devam ettirilen: ${n('resumed')} · Atlanan: ${n('skipped')} · Başarısız: ${n('failed')} · Denenmedi: ${n('not_attempted')}`, '');
  return L.join('\n');
}

export function renderRollbackMarkdown(p: RollbackPlan): string {
  const L: string[] = ['# MURAT/LAB FAZ 3B-B — Rollback planı', '', `- Üretim: ${p.generatedAt} · Plan özeti: \`${p.planDigest}\` · Onay belirteci: \`${rollbackToken(p)}\``, '', '| Tür | Anahtar | Karar | Gerekçe |', '|---|---|---|---|'];
  for (const i of p.items) L.push(`| ${i.kind} | ${i.key} | ${i.decision} | ${i.reasons.join('; ')} |`);
  L.push('', p.items.length ? '' : 'Ledger\'da geri alınacak aktif kayıt yok.', p.siteSql ? 'Site belgeleri için korumalı SQL ayrı dosyada üretildi (elle çalıştırılır).' : '');
  return L.join('\n');
}
