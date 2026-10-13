import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
export function assertSameOrigin(req: NextRequest): boolean {
  const origin=req.headers.get('origin');
  if(!origin)return true; // Non-browser clients also require authenticated session.
  try {
    const url=new URL(origin);
    return url.host===req.nextUrl.host && url.protocol===req.nextUrl.protocol;
  } catch {return false;}
}
export const jsonError=(code:string,status:number)=>NextResponse.json({error:{code}}, {status,headers:{'Cache-Control':'no-store'}});
