import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from './env';

/**
 * Süresi dolmak üzere olan Supabase oturum cookie'lerini yeniler.
 * Yetkilendirme KARARI burada verilmez: korumalı layout'lar sunucuda requireAdmin() ile doğrular.
 * Yapılandırma yoksa istek olduğu gibi geçirilir.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser(), token'ı Supabase Auth sunucusuna karşı doğrular (getSession cookie'ye güvenir, yetkilendirme için kullanılmaz).
  await supabase.auth.getUser();
  return response;
}
