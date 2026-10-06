import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Yalnızca /admin altında çalışır: herkese açık sayfalar bu dosyadan etkilenmez. */
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
