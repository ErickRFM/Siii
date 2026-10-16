import argon2 from 'argon2';
export const ARGON2_OPTIONS={type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1,hashLength:32} as const;
// Public dummy value: not a user credential. Verification still runs when no account is found.
const DUMMY_HASH='$argon2id$v=19$m=65536,p=1,t=3$c2lpaS1kdW1teS1zYWx0LTA$J3weceuXW3g6g1Qfyyb4gzdfojTNwM3h2IMvzIfE4hU';
export const hashPassword=(password:string)=>argon2.hash(password,ARGON2_OPTIONS);
export async function verifyPassword(hash:string|null|undefined,password:string){
 try{const valid=await argon2.verify(hash??DUMMY_HASH,password);return !!hash&&valid;}
 catch{await argon2.verify(DUMMY_HASH,password);return false;}
}
