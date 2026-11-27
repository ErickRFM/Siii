import {describe,expect,it} from 'vitest';
import {OFFLINE_MESSAGE,isNetworkError,userFacingError} from '@/shared/client/user-facing-error';

describe('shared user-facing errors',()=>{
 it('maps a fetch network failure to the offline message instead of a raw browser error',()=>{
  const failure=new TypeError('Failed to fetch');
  expect(isNetworkError(failure)).toBe(true);
  expect(userFacingError(failure)).toBe(OFFLINE_MESSAGE);
  expect(userFacingError(failure,{FORBIDDEN:'x'})).toBe(OFFLINE_MESSAGE);
 });
 it('accepts a code string or an Error(code) and lets a module override or extend codes',()=>{
  expect(userFacingError('FORBIDDEN')).toContain('autorización');
  expect(userFacingError(new Error('SCHEDULE_CONFLICT'))).toContain('intervalo');
  expect(userFacingError('GRADE_SCORE_CONFLICT',{GRADE_SCORE_CONFLICT:'propio'})).toBe('propio');
  expect(userFacingError('FORBIDDEN',{FORBIDDEN:'sobrescrito'})).toBe('sobrescrito');
 });
 it('never exposes an unknown code or message to the user',()=>{
  for(const cause of ['SOMETHING_INTERNAL',new Error('stack detail'),undefined,{}]){
   const message=userFacingError(cause);
   expect(message).not.toMatch(/SOMETHING_INTERNAL|stack detail/);
   expect(message).toContain('No se pudo completar la operación');
  }
 });
});
