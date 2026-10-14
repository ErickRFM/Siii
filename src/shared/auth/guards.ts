import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
export function assertSameOrigin(req: NextRequest): boolean {
  // Fetch Metadata is sent by browsers, including on form submissions without an Origin.
  // Block cross-site and same-site (different subdomain) unsafe requests.
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = req.headers.get('origin');
  // Non-browser clients may omit Origin/Fetch Metadata; authenticated routes still
  // require a valid session and their own authorization checks.
  if (!origin) return true;
  try {
    const host=req.headers.get('host');
    if(host && /[\s/@?#]/.test(host))return false;
    const expected=host?new URL(req.nextUrl.protocol+'//'+host).origin:req.nextUrl.origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
export const jsonError=(code:string,status:number)=>NextResponse.json({error:{code}}, {status,headers:{'Cache-Control':'no-store'}});
