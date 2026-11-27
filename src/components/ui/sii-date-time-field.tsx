'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import {formatDeadline,formatRelative,toLocalInputValue} from '@/shared/format/date-time';

export type SiiDateTimePreset={label:string;hours:number};

export interface SiiDateTimeFieldProps{
 id:string;
 label:string;
 /** datetime-local string in the device time zone, or '' when unset. */
 value:string;
 onChange:(value:string)=>void;
 name?:string;
 min?:string;
 max?:string;
 presets?:readonly SiiDateTimePreset[];
 /** When set, an explicit "leave empty" choice is offered and explained instead of a bare blank input. */
 empty?:{label:string;summary:string};
 hint?:ReactNode;
 required?:boolean;
 disabled?:boolean;
}

/**
 * Deadline input: one-click presets clamped to the allowed range, a native picker
 * for exact times, and a readable summary of what was chosen. No permission logic.
 */
export function SiiDateTimeField({id,label,value,onChange,name,min,max,presets=[],empty,hint,required,disabled}:SiiDateTimeFieldProps){
 // Presets are computed after mount so server and client render the same markup.
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
 const maxMs=max?new Date(max).getTime():Infinity,minMs=min?new Date(min).getTime():-Infinity;
 const options=now===null?[]:presets.map(preset=>{
  const at=now+preset.hours*3600000;
  return {...preset,value:at<=maxMs&&at>=minMs?toLocalInputValue(at):null};
 });
 const summaryId=id+'-summary',hintId=hint?id+'-hint':undefined;
 const summary=value?`Vence el ${formatDeadline(value)} (${formatRelative(value)}).`:empty?.summary;
 // Only the input carries the label, so getByLabel(label) resolves to a single control.
 return <div className="sii-datetime-field grid gap-2">
  <label id={id+'-label'} htmlFor={id}>{label}</label>
  {(options.length>0||empty)&&<div className="flex flex-wrap gap-1.5" role="group" aria-label="Atajos de fecha">
   {empty&&!required&&<PresetButton pressed={!value} disabled={disabled} onClick={()=>onChange('')}>{empty.label}</PresetButton>}
   {options.map(option=><PresetButton key={option.label} pressed={!!value&&value===option.value} disabled={disabled||!option.value}
    onClick={()=>option.value&&onChange(option.value)}>{option.label}</PresetButton>)}
  </div>}
  <Input id={id} name={name} type="datetime-local" value={value} min={min} max={max} required={required} disabled={disabled}
   onChange={event=>onChange(event.target.value)} aria-describedby={[summaryId,hintId].filter(Boolean).join(' ')}/>
  {summary&&<p id={summaryId} className="sii-datetime-summary text-xs text-muted-foreground" aria-live="polite">{summary}</p>}
  {hint&&<p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
 </div>;
}

function PresetButton({pressed,disabled,onClick,children}:{pressed:boolean;disabled?:boolean;onClick:()=>void;children:ReactNode}){
 return <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onClick}
  className={cn('sii-datetime-preset inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors',
   'border-border bg-transparent text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
   'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50')}>{children}</button>;
}
