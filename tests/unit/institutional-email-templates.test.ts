import {describe,it,expect} from 'vitest';
import {renderSiiiEmailHtml} from '../../src/infrastructure/email/templates';

const eventId='20a61098-8f9b-4a6d-beb5-56e87b40bfef';
const token='A'.repeat(43);
const base='https://siii-three.vercel.app';

describe('Siii branded transactional emails',()=>{
 it('renders a professional invitation with escaped one-use link and Spanish security guidance',()=>{
  const link=base+'/invitations/accept#id='+eventId+'&token='+token;
  const html=renderSiiiEmailHtml({eventId,to:'someone@example.com',subject:'Invitación institucional SIII',text:'Para revisar: '+link+'\nLa invitación vence: 2026-10-24T12:30:00.000Z.'},'invitation');
  expect(html).toContain('SISTEMA INSTITUCIONAL');
  expect(html).toContain('Revisar invitación');
  expect(html).toContain('#id='+eventId+'&amp;token='+token);
  expect(html).toContain('UTC');
  expect(html).toContain('ignorar este mensaje');
  expect(html).toContain('background:#4b172e');
  expect(html).not.toContain('manecomb');
 });
 it('renders password resets with distinct action and does not ask for credentials',()=>{
  const html=renderSiiiEmailHtml({eventId,to:'someone@example.com',subject:'Restablecimiento SIII',text:'Restablece: '+base+'/password/reset#id='+eventId+'&token='+token+'\nEl enlace vence: 2026-10-18T07:30:00.000Z.'},'password-reset');
  expect(html).toContain('Recuperación de contraseña');
  expect(html).toContain('Restablecer contraseña');
  expect(html).toContain('no cambiará');
  expect(html).toContain('códigos MFA');
  expect(html).not.toContain('<script');
 });
 it('refuses unsafe or off-purpose actions while rendering a readable informational email',()=>{
  const html=renderSiiiEmailHtml({eventId,to:'someone@example.com',subject:'Original',text:'https://evil.example/password/reset#id='+eventId+'&token='+token},'invitation');
  expect(html).not.toContain('href=');
  expect(html).toContain('Invitación institucional');
 });
 it('escapes arbitrary fragments and never interpolates HTML into the template',()=>{
  const html=renderSiiiEmailHtml({eventId,to:'someone@example.com',subject:'Testing',text:'https://siii-three.vercel.app/invitations/accept#id='+eventId+'&token='+token+'\n<img src=x onerror=alert(1)>'},'invitation');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('onerror');
 });
});
