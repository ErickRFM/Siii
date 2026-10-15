import {describe,it,expect} from 'vitest';
import {runInNewContext} from 'node:vm';
import {invitationFragmentBootstrap} from '../../src/shared/invitations/fragment-bootstrap';

const invitationId='12345678-1234-4234-8234-123456789abc',token='A'.repeat(43);
function harness(path='/invitations/accept',hash=`#id=${invitationId}&token=${token}`){
 const events=new Map<string,(()=>void)[]>();
 const location={pathname:path,hash};
 const state={canonicalUrl:path+hash};
 const window={location,history:{state,replaceState:(nextState:unknown,_unused:string,url:string)=>{window.history.state=nextState as typeof state;expect(url).toBe(location.pathname);location.hash='';}},addEventListener:(name:string,callback:()=>void)=>{events.set(name,[...(events.get(name)??[]),callback]);},dispatchEvent:(event:Event)=>{for(const listener of events.get(event.type)??[])listener();},__siiiTakeInvitation:undefined as undefined|(()=>{invitationId:string;token:string}|null)};
 runInNewContext(invitationFragmentBootstrap,{window,URLSearchParams,Event});
 return {window,reopen:(fragment:string,event='hashchange')=>{location.hash=fragment;window.dispatchEvent(new Event(event));}};
}
describe('invitation fragment bootstrap',()=>{
 it('removes the initial bearer before router initialization and transfers it only once from memory',()=>{const {window}=harness();expect(window.location.hash).toBe('');expect(String(JSON.stringify(window.history.state))).not.toContain(token);expect(window.__siiiTakeInvitation?.()).toEqual({invitationId,token});expect(window.__siiiTakeInvitation?.()).toBeNull();});
 it('captures a new mail link in the same document before later navigation listeners',()=>{const {window,reopen}=harness();window.__siiiTakeInvitation?.();const second='B'.repeat(43);reopen(`#id=${invitationId}&token=${second}`,'popstate');expect(window.location.hash).toBe('');expect(window.__siiiTakeInvitation?.()).toEqual({invitationId,token:second});expect(window.__siiiTakeInvitation?.()).toBeNull();});
 it.each([`#id=${invitationId}&token=${token}&token=${token}`,`#id=${invitationId}&token=bad`,`#id=bad&token=${token}`])('removes invalid fragments without making them usable',hash=>{const {window}=harness('/invitations/accept',hash);expect(window.location.hash).toBe('');expect(window.__siiiTakeInvitation?.()).toBeNull();});
 it('preserves accessible in-page anchors without discarding an unconsumed bearer',()=>{const {window,reopen}=harness();reopen('#main-content');expect(window.location.hash).toBe('#main-content');expect(window.__siiiTakeInvitation?.()).toEqual({invitationId,token});});
 it('does not consume fragments on unrelated application pages',()=>{const {window}=harness('/dashboard','#main-content');expect(window.location.hash).toBe('#main-content');expect(window.__siiiTakeInvitation).toBeUndefined();});
});
