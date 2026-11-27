/** Shared Spanish messages for institutional API error codes; modules add their own codes. */
const BASE_MESSAGES:Readonly<Record<string,string>>={
 UNAUTHENTICATED:'Tu sesión venció. Inicia sesión de nuevo.',
 FORBIDDEN:'Tu autorización cambió o no tienes permiso para esta operación. Actualiza el módulo.',
 MFA_REQUIRED:'Verifica tu autenticador desde Cuenta y seguridad y vuelve a intentar.',
 STEP_UP_REQUIRED:'Confirma tu identidad desde Cuenta y seguridad antes de continuar.',
 PASSWORD_CHANGE_REQUIRED:'Actualiza tu contraseña desde Cuenta y seguridad.',
 VALIDATION_ERROR:'Revisa los datos del formulario e intenta nuevamente.',
 INVALID_TRANSITION:'El registro cambió de estado. Actualiza el listado y vuelve a intentar.',
 NOT_FOUND:'El registro ya no existe o cambió. Actualiza el listado.',
 CONFLICT:'Los datos entran en conflicto con otros registros. Actualiza el listado.',
 SCHEDULE_CONFLICT:'El aula, horario o docente ya tiene una actividad en ese intervalo.',
};
export const OFFLINE_MESSAGE='Sin conexión. La operación no se envió; tus datos se conservan. Vuelve a intentar al reconectarte.';
const FALLBACK='No se pudo completar la operación. Conservamos tus datos; actualiza y vuelve a intentar.';

/** fetch() rejects with TypeError when the network is unreachable. */
export function isNetworkError(cause:unknown){return cause instanceof TypeError;}

/**
 * Maps an error code, a thrown Error(code) or a network failure to a user message.
 * `extra` lets a module add or override codes without copying the shared table.
 */
export function userFacingError(cause:unknown,extra:Readonly<Record<string,string>>={}){
 if(isNetworkError(cause))return OFFLINE_MESSAGE;
 const code=typeof cause==='string'?cause:cause instanceof Error?cause.message:'ERROR';
 return extra[code]??BASE_MESSAGES[code]??FALLBACK;
}
