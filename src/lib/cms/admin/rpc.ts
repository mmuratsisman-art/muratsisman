import { createClient } from '@/lib/supabase/server';
import { classifyDbError, type DbErrorKind } from '../db-errors';

export type RpcResult<T> = { ok: true; data: T } | { ok: false; kind: DbErrorKind };

/**
 * Tüm yazma işlemleri 0004 fonksiyonlarından geçer (SECURITY DEFINER + is_admin() + satır kilidi).
 * Kullanıcının oturumuyla çalışır (service-role YOK). Hata ham olarak dışarı verilmez; yalnızca tür döner.
 */
export async function callRpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    console.error(`[cms] rpc ${name} failed`, { code: error.code, message: error.message });
    return { ok: false, kind: classifyDbError(error) };
  }
  return { ok: true, data: data as T };
}
