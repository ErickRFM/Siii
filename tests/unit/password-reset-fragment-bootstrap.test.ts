import {describe,it,expect} from 'vitest';
import {runInNewContext} from 'node:vm';
import {passwordResetFragmentBootstrap} from '../../src/shared/password-reset/fragment-bootstrap';
import {invitationFragmentBootstrap} from '../../src/shared/invitations/fragment-bootstrap';

const resetId='12345678-1234-4234-8234-123456789abc',token='A'.repeat(43);
function harness(path='/password/reset',hash=`#id=${resetId}&token=${token}`){
 const events=new Map<string,(()=>void)[]>();
 const location={pathname:path,hash};
 const state={canonicalUrl:path+hash};
 const window={location,history:{state,replaceState:(nextState:unknown,_unused:string,url:string)=>{window.history.state=nextState as typeof state;expect(url).toBe(location.pathname);location.hash='';}},addEventListener:(name:string,callback:()=>void)=>{events.set(name,[...(events.get(name)??[]),callback]);},dispatchEvent:(event:Event)=>{for(const listener of events.get(event.type)??[])listener();},__siiiTakePasswordReset:undefined as undefined|(()=>{resetId:string;token:string}|null)};
 runInNewContext(passwordResetFragmentBootstrap,{window,URLSearchParams,Event});
 return {window,reopen:(fragment:string,event='hashchange')=>{location.hash=fragment;window.dispatchEvent(new Event(event));}};
}
describe('password reset fragment bootstrap',()=>{
 it('removes the initial bearer before router initialization and transfers it only once from memory',()=>{const {window}=harness();expect(window.location.hash).toBe('');expect(String(JSON.stringify(window.history.state))).not.toContain(token);expect(window.__siiiTakePasswordReset?.()).toEqual({resetId,token});expect(window.__siiiTakePasswordReset?.()).toBeNull();});
 it('captures a new mail link in the same document before later navigation listeners',()=>{const {window,reopen}=harness();window.__siiiTakePasswordReset?.();const second='B'.repeat(43);reopen(`#id=${resetId}&token=${second}`,'popstate');expect(window.location.hash).toBe('');expect(window.__siiiTakePasswordReset?.()).toEqual({resetId,token:second});expect(window.__siiiTakePasswordReset?.()).toBeNull();});
 it.each([`#id=${resetId}&token=${token}&token=${token}`,`#id=${resetId}&token=bad`,`#id=bad&token=${token}`])('removes invalid fragments without making them usable',hash=>{const {window}=harness('/password/reset',hash);expect(window.location.hash).toBe('');expect(window.__siiiTakePasswordReset?.()).toBeNull();});
 it('preserves accessible in-page anchors without discarding an unconsumed bearer',()=>{const {window,reopen}=harness();reopen('#main-content');expect(window.location.hash).toBe('#main-content');expect(window.__siiiTakePasswordReset?.()).toEqual({resetId,token});});
 it('coexists with the invitation bootstrap without transferring a reset bearer to it',()=>{const {window}=harness();runInNewContext(invitationFragmentBootstrap,{window,URLSearchParams,Event});expect(Object.getOwnPropertyDescriptor(window,'__siiiTakeInvitation')).toBeUndefined();expect(window.__siiiTakePasswordReset?.()).toEqual({resetId,token});});
 it('does not claim the invitation route or interfere with its own handoff',()=>{const {window}=harness('/invitations/accept');runInNewContext(invitationFragmentBootstrap,{window,URLSearchParams,Event});expect(window.__siiiTakePasswordReset).toBeUndefined();expect(Object.getOwnPropertyDescriptor(window,'__siiiTakeInvitation')?.value()).toEqual({invitationId:resetId,token});});
 it('does not consume fragments on unrelated application pages',()=>{const {window}=harness('/dashboard','#main-content');expect(window.location.hash).toBe('#main-content');expect(window.__siiiTakePasswordReset).toBeUndefined();});
});
