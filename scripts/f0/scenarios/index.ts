import type { ScenarioResult } from '../lib/types';
import type { Ctx } from './common';
import { m00 } from './m00-build';
import { m01 } from './m01-status';
import { m02, m03 } from './m02-ttl';
import { m04 } from './m04-invalidate';
import { m05 } from './m05-outage';
import { m06 } from './m06-cold-errors';
import { m07 } from './m07-consistency';
import { m08 } from './m08-build-flip';
import { m09 } from './m09-restart';

export const SCENARIOS: { id: string; est: string; run: (c: Ctx) => Promise<ScenarioResult> }[] = [
  { id: 'M00', est: '~0 sn (build’ler önceden yapılır)', run: m00 },
  { id: 'M01', est: '~1 dk', run: m01 },
  { id: 'M02', est: '~4 dk (gerçek TTL beklemeleri)', run: m02 },
  { id: 'M03', est: '~1,5 dk', run: m03 },
  { id: 'M04', est: '~1 dk', run: m04 },
  { id: 'M05', est: '~6 dk (--quick ile ~3 dk)', run: m05 },
  { id: 'M06', est: '~3 dk (hang zaman aşımı dahil)', run: m06 },
  { id: 'M07', est: '~3 dk', run: m07 },
  { id: 'M08', est: '~1 dk', run: m08 },
  { id: 'M09', est: '~30 sn', run: m09 },
];

export async function runScenarios(ctx: Ctx, only: string[] | null, onDone?: (r: ScenarioResult) => void): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  for (const s of SCENARIOS) {
    if (only && !only.includes(s.id)) continue;
    const res = await s.run(ctx);
    out.push(res);
    onDone?.(res);
  }
  return out;
}
