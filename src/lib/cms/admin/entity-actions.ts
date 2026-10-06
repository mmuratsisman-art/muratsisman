import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { DB_ERROR_MESSAGES } from '../db-errors';
import { INTENT_ERROR_MESSAGE, parseIntent } from './intent';
import type { ContentStatus } from '../types';
import { slugify } from '../slug';
import type { ValidationMode, ValidationResult } from '../validate/common';
import { isTimestampToken, readFields, UUID_RE } from './form';
import { callRpc } from './rpc';
import { failure, type FormState } from './state';

export type BaseLookup = { ok: true; data: { status: ContentStatus; slug: string } } | { ok: false; reason: 'not_found' | 'error' };

/** Test edilebilirlik için enjekte edilebilir bağımlılıklar. Varsayılanlar gerçek uygulamayla birebir aynıdır. */
export interface EntityDeps {
  requireAdmin: () => Promise<{ kind: string }>;
  callRpc: typeof callRpc;
  redirect: (url: string) => never;
}
const defaultDeps: EntityDeps = { requireAdmin, callRpc, redirect };

export interface EntityConfig<Doc extends { slug: string }> {
  /** ör. '/admin/notes' */
  basePath: string;
  fields: readonly string[];
  rpc: { create: string; save: string; publish: string; unpublish: string; discard: string };
  validate: (raw: Record<string, string>, mode: ValidationMode) => ValidationResult<Doc>;
  getBase: (id: string) => Promise<BaseLookup>;
  slugTaken: (slug: string, exceptId?: string) => Promise<boolean | null>;
}

/**
 * Notes ve Lab için ortak mutation çekirdeği. Her mutation:
 *   1) kendi başına requireAdmin() çağırır (layout korumasına GÜVENMEZ); admin değilse hiçbir DB çağrısı yapılmaz
 *   2) yalnızca beklenen form alanlarını okur; kimlik/rol/isAdmin gibi istemci değerleri YOK SAYILIR
 *   3) sunucu tarafında doğrular, sonra yalnızca 0004 fonksiyonlarını çağırır
 * Silme (delete) işlemi YOKTUR: "taslağı at" yalnızca bekleyen taslak dokümanı kaldırır, kaydı silmez.
 */
export function createEntityOps<Doc extends { slug: string }>(cfg: EntityConfig<Doc>, deps: EntityDeps = defaultDeps) {
  // Açık tür açıklaması şart: TypeScript, never-döndüren çağrıları akış analizinde yalnızca böyle tanır.
  const go: (url: string) => never = deps.redirect;
  const rpc: typeof callRpc = deps.callRpc;
  const guard = async () => (await deps.requireAdmin()).kind === 'admin';
  const FORBIDDEN = DB_ERROR_MESSAGES.forbidden;

  async function create(_prev: FormState, fd: FormData): Promise<FormState> {
    if (!(await guard())) return failure(FORBIDDEN);

    const raw = readFields(fd, cfg.fields);
    const v = cfg.validate(raw, 'draft');
    if (!v.ok) return failure('Formda düzeltilmesi gereken alanlar var.', v.errors, raw);

    if ((await cfg.slugTaken(v.value.slug)) === true) {
      return failure(DB_ERROR_MESSAGES.slug_taken, { slug: DB_ERROR_MESSAGES.slug_taken }, raw);
    }

    const r = await rpc<string>(cfg.rpc.create, { p_data: v.value });
    if (!r.ok) return failure(DB_ERROR_MESSAGES[r.kind], r.kind === 'slug_taken' ? { slug: DB_ERROR_MESSAGES.slug_taken } : undefined, raw);
    if (typeof r.data !== 'string' || !UUID_RE.test(r.data)) return failure(DB_ERROR_MESSAGES.unknown, undefined, raw);

    go(`${cfg.basePath}/${r.data}?ok=created`);
  }

  async function save(_prev: FormState, fd: FormData): Promise<FormState> {
    if (!(await guard())) return failure(FORBIDDEN);

    const id = String(fd.get('id') ?? '');
    if (!UUID_RE.test(id)) return failure(DB_ERROR_MESSAGES.not_found);

    const rawIn = readFields(fd, cfg.fields);

    // İşlem türü (kaydet / yayınla) AÇIKÇA gelmek zorunda. Eksik veya geçersizse HİÇBİR şey yapılmaz:
    // sessizce "kaydet"e düşmek, yayın isteğinin başarılı bir kayıt gibi görünmesine yol açıyordu.
    const intent = parseIntent(fd.get('intent'));
    if (!intent) return failure(INTENT_ERROR_MESSAGE, undefined, rawIn);
    const publish = intent === 'publish';
    const tokenRaw = String(fd.get('expected_draft_updated_at') ?? '');
    if (tokenRaw !== '' && !isTimestampToken(tokenRaw)) return failure(DB_ERROR_MESSAGES.unknown, undefined, rawIn);

    const base = await cfg.getBase(id);
    if (!base.ok) return failure(base.reason === 'not_found' ? DB_ERROR_MESSAGES.not_found : DB_ERROR_MESSAGES.unknown, undefined, rawIn);

    // Yayındaki içeriğin slug'ı değiştirilemez (adres kırılır). Farklı bir değer gönderilirse sessizce yok sayılmaz, reddedilir.
    const locked = base.data.status === 'published';
    let raw = rawIn;
    if (locked) {
      const submitted = (rawIn.slug ?? '').trim();
      if (submitted && slugify(submitted) !== base.data.slug) {
        return failure(DB_ERROR_MESSAGES.slug_locked, { slug: DB_ERROR_MESSAGES.slug_locked }, rawIn);
      }
      raw = { ...rawIn, slug: base.data.slug };
    }

    const v = cfg.validate(raw, publish ? 'publish' : 'draft');
    const errors: Record<string, string> = v.ok ? {} : { ...v.errors };
    if (publish && fd.get('confirm_publish') !== 'on') errors.confirm_publish = 'Yayınlamak için onay kutusunu işaretleyin.';
    if (!v.ok || Object.keys(errors).length) return failure('Formda düzeltilmesi gereken alanlar var.', errors, rawIn);

    if (v.value.slug !== base.data.slug && (await cfg.slugTaken(v.value.slug, id)) === true) {
      return failure(DB_ERROR_MESSAGES.slug_taken, { slug: DB_ERROR_MESSAGES.slug_taken }, rawIn);
    }

    // 1) taslağı kaydet (canlı satıra DOKUNMAZ; eşzamanlı düzenleme token'ı DB'de karşılaştırılır)
    const saved = await rpc<string>(cfg.rpc.save, { p_id: id, p_data: v.value, p_expected_draft_updated_at: tokenRaw === '' ? null : tokenRaw });
    if (!saved.ok) return failure(DB_ERROR_MESSAGES[saved.kind], saved.kind === 'slug_taken' ? { slug: DB_ERROR_MESSAGES.slug_taken } : undefined, rawIn);

    if (!publish) go(`${cfg.basePath}/${id}?ok=saved`);

    // 2) yayınla (atomik; eskimiş taslak DB tarafında reddedilir). Kaydetme başarılı olduğundan taslak korunur.
    const pub = await rpc(cfg.rpc.publish, { p_id: id });
    if (!pub.ok) go(`${cfg.basePath}/${id}?err=${pub.kind === 'stale' ? 'published_stale' : pub.kind}`);
    go(`${cfg.basePath}/${id}?ok=published`);
  }

  async function unpublish(fd: FormData): Promise<void> {
    if (!(await guard())) go(`${cfg.basePath}?err=forbidden`);
    const id = String(fd.get('id') ?? '');
    if (!UUID_RE.test(id)) go(`${cfg.basePath}?err=not_found`);
    if (fd.get('confirm_unpublish') !== 'on') go(`${cfg.basePath}/${id}?err=confirm`);

    const r = await rpc(cfg.rpc.unpublish, { p_id: id });
    go(r.ok ? `${cfg.basePath}/${id}?ok=unpublished` : `${cfg.basePath}/${id}?err=${r.kind}`);
  }

  async function discard(fd: FormData): Promise<void> {
    if (!(await guard())) go(`${cfg.basePath}?err=forbidden`);
    const id = String(fd.get('id') ?? '');
    if (!UUID_RE.test(id)) go(`${cfg.basePath}?err=not_found`);
    if (fd.get('confirm_discard') !== 'on') go(`${cfg.basePath}/${id}?err=confirm`);

    const r = await rpc(cfg.rpc.discard, { p_id: id });
    go(r.ok ? `${cfg.basePath}/${id}?ok=discarded` : `${cfg.basePath}/${id}?err=${r.kind}`);
  }

  return { create, save, unpublish, discard };
}
