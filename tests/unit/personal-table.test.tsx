import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PersonalTable,orderPersonalRows} from '../../src/components/personal-table';

type RecordRow={id:string;name:string;score:number|null};

const records:RecordRow[]=[
 {id:'r1',name:'Álgebra 10',score:80},
 {id:'r2',name:'algebra 2',score:95},
 {id:'r3',name:'Biología',score:null},
 {id:'r4',name:'Álgebra 2',score:95}
];

describe('shared personal table UX and safety',()=>{
 it('sorts accent-insensitive labels with numeric awareness and stable ties',()=>{
  const ordered=orderPersonalRows(records,row=>row.name,'asc');
  expect(ordered.map(row=>row.id)).toEqual(['r2','r4','r1','r3']);
  expect(records.map(row=>row.id)).toEqual(['r1','r2','r3','r4']);
 });
 it('sorts numeric values without confusing 9 and 10',()=>{
  const input=[{id:'1',value:10},{id:'2',value:9},{id:'3',value:100}];
  expect(orderPersonalRows(input,row=>row.value,'asc').map(row=>row.id)).toEqual(['2','1','3']);
  expect(orderPersonalRows(input,row=>row.value,'desc').map(row=>row.id)).toEqual(['3','1','2']);
 });
 it('keeps missing official values last in both directions',()=>{
  expect(orderPersonalRows(records,row=>row.score,'asc').map(row=>row.id)).toEqual(['r1','r2','r4','r3']);
  expect(orderPersonalRows(records,row=>row.score,'desc').map(row=>row.id)).toEqual(['r2','r4','r1','r3']);
 });
 it('preserves semantic desktop table, mobile records and available sort controls',()=>{
  const html=renderToStaticMarkup(<PersonalTable rows={records} label="Calificaciones" searchText={row=>row.name} columns={[
   {label:'Materia',sortValue:row=>row.name,render:row=>row.name},
   {label:'Nota',sortValue:row=>row.score,render:row=>row.score??'No publicada'}
  ]}/>);
  expect(html).toContain('<table');
  expect(html).toContain('scope="col"');
  expect(html).toContain('aria-sort="none"');
  expect(html).toContain('Ordenar por Materia');
  expect(html).toContain('Ordenar Calificaciones');
  expect(html).toContain('aria-label="Calificaciones"');
  expect(html).toContain('Mostrando 1–4 de 4 registros');
  expect(html).toContain('No publicada');
 });
 it('paginates without fabricating records',()=>{
  const many=Array.from({length:21},(_,i)=>({id:String(i),name:'Registro '+i}));
  const html=renderToStaticMarkup(<PersonalTable rows={many} label="Expedientes" columns={[{label:'Nombre',render:row=>row.name}]}/>);
  expect(html).toContain('Mostrando 1–20 de 21 registros');
  expect(html).toContain('Siguiente');
  expect(html).not.toContain('Registro 20');
 });
 it('distinguishes an empty official query from fake sample data',()=>{
  const html=renderToStaticMarkup(<PersonalTable rows={[] as RecordRow[]} label="Pagos" columns={[{label:'Nota',render:row=>row.score}]}/>);
  expect(html).toContain('Sin registros para mostrar');
  expect(html).toContain('No hay registros oficiales disponibles');
  expect(html).not.toContain('Mostrando 1–');
 });
});
