import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { DB_ERROR_MESSAGES } from '../db-errors';
import { isSiteKey, SITE_FIELDS, validateSiteInput } from '../validate/site';
import type { EntityDeps } from './entity-actions';
import { isTimestampToken, readFields } from './form';
import { INTENT_ERROR_MESSAGE, parseIntent } from './intent';
import { callRpc } from './rpc';
import { failure, type FormState } from './state';

const defaultDeps: EntityDeps = { requireAdmin, callRpc, redirect };
const BASE = '/admin/site';

/**
 * Site içeriği mutation çekirdeği (Projects/Notes/Lab ile AYNI ilkeler):
 *   requireAdmin() ilk adım · yalnızca allowlist'teki alanlar okunur · intent AÇIKÇA gelmek zorunda (eksik/geçersiz → hiçbir şey yapılmaz) ·
 *   Yayınla için onay kutusu sunucuda zorunlu · sunucu doğrulaması · yalnızca 0005 fonksiyonları (RLS + is_admin() DB'de).
 * Site içeriğinde "yayından kaldır" ve "sil" YOKTUR.
 */
export function createSiteOps(deps: EntityDeps = defaultDeps) {
  const go: (url: string) => never = deps.redirect;
  const rpc: typeof callRpc = deps.callRpc;
  const guard = async () => (await deps.requireAdmin()).kind === 'admin';

  async function save(_prev: FormState, fd: FormData): Promise<FormState> {
    if (!(await guard())) return failure(DB_ERROR_MESSAGES.forbidden);

    const key = String(fd.get('key') ?? '');
    if (!isSiteKey(key)) return failure(DB_ERROR_MESSAGES.not_found);

    const raw = readFields(fd, SITE_FIELDS[key]);
    const intent = parseIntent(fd.get('intent'));
    if (!intent) return failure(INTENT_ERROR_MESSAGE, undefined, raw);
    const publish = intent === 'publish';

    const tokenRaw = String(fd.get('expected_draft_updated_at') ?? '');
    if (tokenRaw !== '' && !isTimestampToken(tokenRaw)) return failure(DB_ERROR_MESSAGES.unknown, undefined, raw);

    const v = validateSiteInput(key, raw);
    const errors: Record<string, string> = v.ok ? {} : { ...v.errors };
    if (publish && fd.get('confirm_publish') !== 'on') errors.confirm_publish = 'Yayınlamak için onay kutusunu işaretleyin.';
    if (!v.ok || Object.keys(errors).length) return failure('Formda düzeltilmesi gereken alanlar var.', errors, raw);

    // 1) taslağı kaydet (yayındaki belgeye DOKUNMAZ; eşzamanlı düzenleme token'ı DB'de karşılaştırılır)
    const saved = await rpc<string>('save_site_content_draft', { p_key: key, p_data: v.value, p_expected_draft_updated_at: tokenRaw === '' ? null : tokenRaw });
    if (!saved.ok) return failure(DB_ERROR_MESSAGES[saved.kind], undefined, raw);

    if (!publish) go(`${BASE}/${key}?ok=saved`);

    // 2) yayınla: YALNIZCA az önce kaydedilen taslak sürümü (başka sekmenin daha yeni düzenlemesi sessizce yayınlanmaz)
    if (typeof saved.data !== 'string' || !isTimestampToken(saved.data)) go(`${BASE}/${key}?err=unknown`);
    const pub = await rpc('publish_site_content_draft', { p_key: key, p_expected_draft_updated_at: saved.data });
    if (!pub.ok) go(`${BASE}/${key}?err=${pub.kind === 'stale' ? 'published_stale' : pub.kind}`);
    go(`${BASE}/${key}?ok=published`);
  }

  async function discard(fd: FormData): Promise<void> {
    if (!(await guard())) go(`${BASE}?err=forbidden`);
    const key = String(fd.get('key') ?? '');
    if (!isSiteKey(key)) go(`${BASE}?err=not_found`);
    if (fd.get('confirm_discard') !== 'on') go(`${BASE}/${key}?err=confirm`);

    const r = await rpc('discard_site_content_draft', { p_key: key });
    go(r.ok ? `${BASE}/${key}?ok=discarded` : `${BASE}/${key}?err=${r.kind}`);
  }

  return { save, discard };
}
