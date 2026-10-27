import pino, { type DestinationStream } from 'pino';
export function createLogger(destination?:DestinationStream) {
 const options:pino.LoggerOptions={
  level:process.env.LOG_LEVEL || 'info',
  redact:{paths:['password','passwordHash','password_hash','token','tokenHash','DATABASE_URL','email','phone','*.password','*.passwordHash','*.token','*.email','*.phone','req.headers.authorization','req.headers.cookie'],censor:'[REDACTED]'},
 };
 return destination?pino(options,destination):pino(options);
}
export const logger=createLogger();
