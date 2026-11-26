import type {ReactNode} from 'react';
import {Button} from '@/components/ui/button';

/**
 * Cursor pagination footer shared by catalog tables. Labels stay configurable
 * because screens with several lists prefix them ("Usuarios: página anterior").
 */
export function SiiPagination({label,page,pageText,previousLabel='Página anterior',nextLabel='Siguiente página',canPrevious,canNext,disabled=false,onPrevious,onNext,children}:{
 label:string;page:number;pageText?:string;previousLabel?:string;nextLabel?:string;
 canPrevious:boolean;canNext:boolean;disabled?:boolean;
 onPrevious:()=>void;onNext:()=>void;children?:ReactNode;
}){
 return <nav className="sii-catalog-pagination" aria-label={label}>
  <Button variant="outline" type="button" className="sii-outline-button" disabled={!canPrevious||disabled} onClick={onPrevious}>{previousLabel}</Button>
  <span aria-live="polite">{pageText??`Página ${page}`}</span>
  <Button variant="outline" type="button" className="sii-outline-button" disabled={!canNext||disabled} onClick={onNext}>{nextLabel}</Button>
  {children}
 </nav>;
}
