/**
 * REGRESYON TESTİ (FAZ 3B-A1 R2): "Yayınla" isteğinin sessizce "Kaydet"e dönüşmesi hatası.
 *
 * R1'de sunucu intent'i gönderen düğmenin name/value'sundan okuyordu; React'in sentetik form gönderiminde bu bilginin
 * FormData'ya girmesi sürüme bağlıydı. Gerçek Next çalışmasında intent gelmedi (`intent: null`, `confirm_publish: 'on'`)
 * ve sunucu varsayılan olarak "kaydet"e düşüp `?ok=saved` döndü. Bu test, Notes ve Lab için ortak çekirdeği
 * (createEntityOps) enjekte edilmiş bağımlılıklarla çalıştırır: Next, Supabase ve veritabanı GEREKMEZ.
 *
 *   npx tsx scripts/cms/verify-intent-flow.ts
 */
import assert from 'node:assert/strict';
import { createEntityOps, type EntityConfig, type EntityDeps } from '@/lib/cms/admin/entity-actions';
import { INTENT_ERROR_MESSAGE, parseIntent } from '@/lib/cms/admin/intent';
import { labEntityConfig } from '@/lib/cms/admin/labs-config';
import { noteEntityConfig } from '@/lib/cms/admin/notes-config';
import type { FormState } from '@/lib/cms/admin/state';
import { DB_ERROR_MESSAGES } from '@/lib/cms/db-errors';
import type { ContentStatus } from '@/lib/cms/types';

class Redirected extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}
type RpcCall = { name: string; args: Record<string, unknown> };

function harness(opts: { admin?: boolean; status?: ContentStatus; slug?: string; rpcError?: Record<string, string> } = {}) {
  const { admin = true, status = 'draft', slug = 'mevcut', rpcError = {} } = opts;
  const calls: RpcCall[] = [];
  let guardCalls = 0;
  const deps: EntityDeps = {
    requireAdmin: async () => {
      guardCalls += 1;
      return { kind: admin ? 'admin' : 'forbidden' };
    },
    callRpc: async <T>(name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const code = rpcError[name];
      if (code) return { ok: false as const, kind: code as 'stale' };
      return { ok: true as const, data: (name.startsWith('save') ? '2026-10-06T10:00:00.123456+00:00' : null) as T };
    },
    redirect: (url: string): never => {
      throw new Redirected(url);
    },
  };
  return { deps, calls, guardCalls: () => guardCalls, status, slug };
}

// Doc yalnızca dönüş konumunda geçtiğinden EntityConfig<NoteDoc> ve EntityConfig<LabDoc>, EntityConfig<{ slug: string }>'a atanabilir.
async function submit(cfg: EntityConfig<{ slug: string }>, h: ReturnType<typeof harness>, fields: Record<string, string>) {
  const ops = createEntityOps({ ...cfg, getBase: async () => ({ ok: true, data: { status: h.status, slug: h.slug } }), slugTaken: async () => false }, h.deps);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    return { state: (await ops.save({ status: 'idle' }, fd)) as FormState, redirect: null as string | null };
  } catch (e) {
    if (e instanceof Redirected) return { state: null, redirect: e.url };
    throw e;
  }
}

const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '2026-10-06T10:00:00.123456+00:00';
const SPECS = [
  {
    name: 'Notes',
    cfg: noteEntityConfig,
    base: '/admin/notes',
    rpc: { save: 'save_note_draft', publish: 'publish_note' },
    form: { id: ID, title: 'Başlık', slug: 'mevcut', excerpt: 'Özet', body: 'Merhaba', tags: 'a', accent: 'blue', published_at: '', reading_time: '', expected_draft_updated_at: TOKEN },
  },
  {
    name: 'Lab',
    cfg: labEntityConfig,
    base: '/admin/lab',
    rpc: { save: 'save_lab_entry_draft', publish: 'publish_lab_entry' },
    form: { id: ID, title: 'Deney', slug: 'mevcut', type: 'EXPERIMENT', experiment_status: 'ACTIVE', summary: 'Özet', description: '', accent: 'green', year: '2026', tags: '', sort_order: '', story_why: 'w', expected_draft_updated_at: TOKEN },
  },
] as const;

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message.split('\n')[0]}`);
  }
}
const names = (calls: RpcCall[]) => calls.map((c) => c.name).join(',');

(async () => {
  await check('parseIntent: yalnızca tam eşleşme', async () => {
    assert.equal(parseIntent('save'), 'save');
    assert.equal(parseIntent('publish'), 'publish');
    for (const bad of [null, '', 'PUBLISH', 'Publish', 'publish ', ' save', 'delete', 'save,publish', 'publish\n']) assert.equal(parseIntent(bad), null, String(bad));
    assert.equal(parseIntent(new File([''], 'x')), null);
  });

  for (const S of SPECS) {
    const T = (t: string) => `${S.name}: ${t}`;

    await check(T('SAVE gönderimi → yalnızca taslak kaydı, ?ok=saved'), async () => {
      const h = harness({ status: 'published' });
      const r = await submit(S.cfg, h, { ...S.form, intent: 'save' });
      assert.equal(names(h.calls), S.rpc.save);
      assert.equal(r.redirect, `${S.base}/${ID}?ok=saved`);
    });

    await check(T('PUBLISH + onay → sırayla taslak kaydı, sonra publish RPC; ?ok=published'), async () => {
      const h = harness();
      const r = await submit(S.cfg, h, { ...S.form, intent: 'publish', confirm_publish: 'on' });
      assert.equal(names(h.calls), `${S.rpc.save},${S.rpc.publish}`);
      assert.deepEqual(Object.keys(h.calls[1].args), ['p_id']);
      assert.equal(r.redirect, `${S.base}/${ID}?ok=published`);
    });

    await check(T('PUBLISH onay kutusu OLMADAN → fail-closed (RPC yok)'), async () => {
      const h = harness();
      const r = await submit(S.cfg, h, { ...S.form, intent: 'publish' });
      assert.equal(h.calls.length, 0);
      assert.equal(r.redirect, null);
      assert.ok(r.state?.fieldErrors?.confirm_publish);
    });

    await check(T('R1 HATASININ BİREBİR YÜKÜ: intent YOK + confirm_publish=on → fail-closed, SESSİZ KAYIT YOK'), async () => {
      const h = harness();
      const r = await submit(S.cfg, h, { ...S.form, confirm_publish: 'on' });
      assert.equal(h.calls.length, 0, 'intent yokken hiçbir RPC çağrılmamalı');
      assert.equal(r.redirect, null, '?ok=saved dönmemeli');
      assert.equal(r.state?.status, 'error');
      assert.equal(r.state?.message, INTENT_ERROR_MESSAGE);
    });

    await check(T('geçersiz intent değerleri → fail-closed'), async () => {
      for (const bad of ['', 'PUBLISH', 'publish ', 'delete', 'save,publish', 'unpublish', '1']) {
        const h = harness();
        const r = await submit(S.cfg, h, { ...S.form, intent: bad, confirm_publish: 'on' });
        assert.equal(h.calls.length, 0, JSON.stringify(bad));
        assert.equal(r.state?.message, INTENT_ERROR_MESSAGE, JSON.stringify(bad));
      }
    });

    await check(T('SAVE + başıboş confirm_publish → YALNIZCA kaydeder, yayınlamaz'), async () => {
      const h = harness();
      await submit(S.cfg, h, { ...S.form, intent: 'save', confirm_publish: 'on' });
      assert.equal(names(h.calls), S.rpc.save);
    });

    await check(T('admin DEĞİL → hiçbir RPC yok (requireAdmin önce)'), async () => {
      for (const intent of ['save', 'publish', undefined]) {
        const h = harness({ admin: false });
        const r = await submit(S.cfg, h, { ...S.form, ...(intent ? { intent } : {}), confirm_publish: 'on' });
        assert.equal(h.calls.length, 0);
        assert.ok(h.guardCalls() >= 1);
        assert.equal(r.state?.message, DB_ERROR_MESSAGES.forbidden);
      }
    });

    await check(T('stale publish korunuyor → ?err=published_stale (taslak kaydedildi)'), async () => {
      const h = harness({ rpcError: { [S.rpc.publish]: 'stale' } });
      const r = await submit(S.cfg, h, { ...S.form, intent: 'publish', confirm_publish: 'on' });
      assert.equal(names(h.calls), `${S.rpc.save},${S.rpc.publish}`);
      assert.equal(r.redirect, `${S.base}/${ID}?err=published_stale`);
    });

    await check(T('kaydetmede eşzamanlı-düzenleme token\'ı birebir iletilir'), async () => {
      const h = harness();
      await submit(S.cfg, h, { ...S.form, intent: 'save' });
      assert.equal(h.calls[0].args.p_expected_draft_updated_at, TOKEN);
    });

    await check(T('yayındaki içerikte slug kilidi korunuyor (intent publish olsa da)'), async () => {
      const h = harness({ status: 'published' });
      const r = await submit(S.cfg, h, { ...S.form, slug: 'baska-slug', intent: 'publish', confirm_publish: 'on' });
      assert.equal(h.calls.length, 0);
      assert.equal(r.state?.fieldErrors?.slug, DB_ERROR_MESSAGES.slug_locked);
    });

    await check(T('doğrulama hatası → RPC yok'), async () => {
      const h = harness();
      const r = await submit(S.cfg, h, { ...S.form, title: '', intent: 'publish', confirm_publish: 'on' });
      assert.equal(h.calls.length, 0);
      assert.ok(r.state?.fieldErrors?.title);
    });
  }

  await check('Notes ve Lab AYNI çekirdeği kullanır (parity: aynı senaryo, aynı çağrı deseni)', async () => {
    const pattern = async (S: (typeof SPECS)[number]) => {
      const out: string[] = [];
      for (const [intent, confirm] of [['save', false], ['publish', true], ['publish', false], [undefined, true]] as const) {
        const h = harness();
        const r = await submit(S.cfg, h, { ...S.form, ...(intent ? { intent } : {}), ...(confirm ? { confirm_publish: 'on' } : {}) });
        out.push(`${intent ?? '∅'}/${confirm}: ${h.calls.length} rpc, ${r.redirect ? 'redirect:' + r.redirect.replace(/^.*\?/, '') : 'state:' + r.state?.status}`);
      }
      return out.join(' | ');
    };
    assert.equal(await pattern(SPECS[0]), await pattern(SPECS[1]));
  });

  console.log(`${passed} kontrol geçti, ${failures.length} başarısız.`);
  if (failures.length) {
    for (const f of failures) console.log('  HATA', f);
    process.exit(1);
  }
  console.log('REGRESYON TESTİ GEÇTİ: Save → taslak, Publish+onay → publish, onaysız/eksik intent → fail-closed (Notes ve Lab)');
})();
