import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {NativeSelect} from '../../src/components/ui/native-select';
import {Textarea} from '../../src/components/ui/textarea';
import {Table,TableBody,TableCell,TableRow} from '../../src/components/ui/table';
import {Input} from '../../src/components/ui/input';

describe('institutional kit native form contracts',()=>{
 it('preserves native select submission, browser validation and selected options',()=>{
  const html=renderToStaticMarkup(createElement(NativeSelect,{name:'programId',required:true,defaultValue:'program-2','aria-describedby':'program-help'},
   createElement('option',{value:'',disabled:true},'Selecciona'),
   createElement('option',{value:'program-2'},'Programa real')));
  expect(html).toContain('<select');expect(html).toContain('name="programId"');
  expect(html).toContain('required=""');expect(html).toContain('aria-describedby="program-help"');
  expect(html).toContain('value="program-2" selected=""');
 });
 it('keeps disabled selects and textarea constraints intact',()=>{
  const select=renderToStaticMarkup(createElement(NativeSelect,{name:'teacherId',disabled:true}));
  const textarea=renderToStaticMarkup(createElement(Textarea,{name:'reason',required:true,minLength:10,rows:3,defaultValue:'Motivo institucional'}));
  expect(select).toContain('disabled=""');expect(textarea).toContain('name="reason"');
  expect(textarea).toContain('minLength="10"');expect(textarea).toContain('rows="3"');expect(textarea).toContain('Motivo institucional</textarea>');
 });
 it('does not add a second scrolling container inside an accessible table region',()=>{
  const html=renderToStaticMarkup(createElement(Table,{scrollable:false,'aria-label':'Expedientes'},
   createElement(TableBody,null,createElement(TableRow,null,createElement(TableCell,{colSpan:2},'Sin registros')))));
  expect(html.startsWith('<table')).toBe(true);expect(html).not.toContain('overflow-auto');
  expect(html).toContain('colSpan="2"');expect(html).toContain('aria-label="Expedientes"');
 });
 it('keeps checkbox geometry separate from text fields and preserves checked submission',()=>{
  const html=renderToStaticMarkup(createElement(Input,{type:'checkbox',name:'terms',value:'accepted',defaultChecked:true}));
  expect(html).toContain('checked=""');expect(html).toContain('value="accepted"');expect(html).not.toContain('w-full');
 });
});
