import { check, info } from '../lib/types';
import { guarded, notRun, type Ctx } from './common';

const SYM: Record<string, string> = { '○': 'statik', '●': 'SSG', 'ƒ': 'dinamik', 'λ': 'dinamik', '◐': 'PPR' };

export function parseRoutes(output: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of output.split('\n')) {
    const x = /^\s*[┌├└]\s+([○●ƒλ◐])\s+(\S+)/.exec(line);
    if (x) m.set(x[2], x[1]);
  }
  return m;
}

export async function m00(ctx: Ctx) {
  if (!ctx.builds.cms || !ctx.builds.static) return notRun('M00', 'Build ve rota türleri', 'Build çalıştırılmadı (Next kurulu değil ya da --only ile atlandı).');
  const { cms, static: stat } = ctx.builds;
  return guarded('M00', 'Build ve rota türleri (cms / static)', async (r) => {
    r.checks.push(check('infra', 'cms build', 'çıkış kodu 0', `çıkış kodu ${cms.code}`, cms.code === 0));
    r.checks.push(check('infra', 'static build', 'çıkış kodu 0', `çıkış kodu ${stat.code}`, stat.code === 0));
    for (const [n, b] of [['cms', cms], ['static', stat]] as const) {
      const fontFail = /Failed to fetch `?(Bricolage|Inter|JetBrains)|F0_EGRESS_BLOCKED|Missing mocked response/i.test(b.output);
      r.checks.push(check('infra', `${n} build: Google Fonts erişimi/font hatası yok (çevrimdışı font taklidi)`, 'hata/engel yok', fontFail ? 'font hatası veya engellenen bağlantı var' : 'yok', !fontFail));
      if (/multiple lockfiles|inferred your workspace root/i.test(b.output)) r.checks.push(info(`${n} build: çoklu lockfile / workspace kökü uyarısı`, 'Beklenen: sandbox proje klasörünün İÇİNDE olduğundan Next üst klasördeki package-lock.json’u da görür. Yalnızca çıktı izleme (file tracing) kökünü etkiler; `next start` davranışını, önbelleği ve rotaları etkilemez. Belgelendi, düzeltilmedi.'));
    }
    const rc = parseRoutes(cms.output);
    const rs = parseRoutes(stat.output);
    r.observations.push(`cms build rota tablosu: ${[...rc].map(([k, v]) => `${k}=${SYM[v] ?? v}`).join(', ') || '(ayrıştırılamadı)'}`);
    r.observations.push(`static build rota tablosu: ${[...rs].map(([k, v]) => `${k}=${SYM[v] ?? v}`).join(', ') || '(ayrıştırılamadı)'}`);
    if (rc.size === 0) {
      r.checks.push({ kind: 'doc', name: 'cms rotaları dinamik (ƒ)', expected: 'ƒ', observed: 'rota tablosu ayrıştırılamadı', verdict: 'NOT RUN' });
    } else {
      for (const route of ['/', '/lab', '/notes', '/notes/[slug]', '/lab/[slug]', '/projects/[slug]']) {
        r.checks.push(check('doc', `cms build: ${route} dinamik`, 'ƒ (istek anında üretilir)', `${rc.get(route) ?? 'yok'} ${SYM[rc.get(route) ?? ''] ?? ''}`, rc.get(route) === 'ƒ'));
      }
    }
    const contentReqs = cms.requests.filter((x) => x.table && x.table !== 'site_content_published');
    r.checks.push(check('doc', 'cms build: içerik tablolarına istek yok', '0 (generateStaticParams boş; build’de DB gerekmez)', `${contentReqs.length}`, contentReqs.length === 0));
    r.checks.push(check('info', 'cms build: sahte sunucuya giden istekler', '-', `${cms.requests.length} (${[...new Set(cms.requests.map((x) => x.table ?? x.path))].join(', ') || 'yok'})`, true));
    r.checks.push(check('doc', 'static build: veritabanına istek yok', '0', `${stat.requests.length}`, stat.requests.length === 0));
    r.checks.push(info('Build süresi', `cms ${(cms.ms / 1000).toFixed(0)} sn, static ${(stat.ms / 1000).toFixed(0)} sn`));
  });
}
