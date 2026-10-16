export const SESSION_DAYS=7;
export const SESSION_IDLE_MS=30*60*1000;
export const SESSION_LIMIT=5;
export const SESSION_COOKIE=process.env.NODE_ENV==='production'?'__Host-siii_session':'siii_session';
export function cookieOptions(expires?:Date){
 return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',...(expires?{expires}:{})};
}
