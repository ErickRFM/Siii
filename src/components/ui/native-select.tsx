import * as React from 'react';
import {cn} from '@/lib/utils';

/** Native select keeps FormData, required validation, multiple values and DOM refs. */
const NativeSelect=React.forwardRef<HTMLSelectElement,React.ComponentProps<'select'>>(
 ({className,...props},ref)=><select ref={ref} data-sii-control="select" className={cn(
  'min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',className
 )} {...props}/>
);
NativeSelect.displayName='NativeSelect';
export {NativeSelect};
