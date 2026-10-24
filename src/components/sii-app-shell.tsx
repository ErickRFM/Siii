'use client';

import Link from 'next/link';
import type {Route} from 'next';
import {usePathname} from 'next/navigation';
import {resolveDashboardLocation,type DashboardActive} from '@/shared/navigation/dashboard-location';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Menu,PanelLeftClose,PanelLeftOpen,X} from 'lucide-react';
import {SiiBrand,SiiMark} from './sii-brand';
import {SiiNavIcon,type SiiNavIconName} from './sii-nav-icon';
import SiiQuickSwitch,{type SiiQuickLink} from './sii-quick-switch';
import SiiThemeToggle from './sii-theme-toggle';
import {InstitutionCapabilitiesProvider,useInstitutionCapabilities,hasInstitutionCapability} from './institution-capabilities';
import {GradebookDraftsProvider} from './teacher-gradebook-drafts';
import {academicModuleLinks,allAcademicModuleLinks} from '@/shared/navigation/academic-modules';
import {Avatar,AvatarFallback} from '@/components/ui/avatar';
import {Badge} from '@/components/ui/badge';
import {Breadcrumb,BreadcrumbItem,BreadcrumbList,BreadcrumbPage,BreadcrumbSeparator} from '@/components/ui/breadcrumb';
import {Button} from '@/components/ui/button';
import {Sidebar,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupContent,SidebarGroupLabel,SidebarHeader,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarProvider,SidebarSeparator,useSidebar} from '@/components/ui/sidebar';

const COLLAPSED_KEY='siii:sidebar-collapsed';
function iconForModule(id:string):SiiNavIconName {
  switch(id){
    case 'registry': return 'registry';
    case 'admissions': return 'registry';
    case 'operations': return 'layers';
    case 'grading': return 'grades';
    case 'scheduling': return 'calendar';
    default: return 'services';
  }
}

export default function SiiAppShell({actorId,firstName,fullName,defaultInstitutionId,children}:{
 actorId:string; firstName:string; fullName:string; defaultInstitutionId?:string; children:ReactNode;
}){
 const pathname=usePathname();
 const {active,institutionId}=resolveDashboardLocation(pathname,defaultInstitutionId);
 const [sidebarOpen,setSidebarOpen]=useState(true);
 useEffect(()=>{
  try{setSidebarOpen(window.localStorage.getItem(COLLAPSED_KEY)!=='true');}catch{/* Optional preference. */}
 },[]);
 const updateSidebar=(open:boolean)=>{
  setSidebarOpen(open);
  try{window.localStorage.setItem(COLLAPSED_KEY,String(!open));}catch{/* Optional preference. */}
 };
 return <GradebookDraftsProvider key={actorId} actorId={actorId}><InstitutionCapabilitiesProvider key={institutionId??'personal'} institutionId={institutionId}>
  <SidebarProvider open={sidebarOpen} onOpenChange={updateSidebar} className={'sii-app sii-ui flex min-h-svh w-full'+(sidebarOpen?'':' sii-app--collapsed')}>
   <Shell firstName={firstName} fullName={fullName} active={active} institutionId={institutionId}
     institutionAdministrationAvailable={active==='administration'}>{children}</Shell>
  </SidebarProvider>
 </InstitutionCapabilitiesProvider></GradebookDraftsProvider>;
}

function Shell({firstName,fullName,active,institutionId,institutionAdministrationAvailable,children}:{firstName:string;fullName:string;active:DashboardActive;institutionId?:string;institutionAdministrationAvailable:boolean;children:ReactNode}) {
 const {data,loading,error}=useInstitutionCapabilities();
 const verifying=Boolean(institutionId && loading && !data);
 const unavailableLabel=!institutionId?'Selecciona institución':verifying?'Verificando…':error?'No disponible':'Restringido';
 const modules=academicModuleLinks(data&&!data.restricted?data.capabilities:[]);
 const activeModule=allAcademicModuleLinks.find(module=>module.id===active);
 const academicAvailable=['programs','courses','curricula','terms','campuses'].some(resource=>hasInstitutionCapability(data,`${resource}.read`));
 const quickLinks:SiiQuickLink[]=[
  {id:'overview',label:'Inicio',href:'/dashboard',group:'Plataforma'},
  {id:'security',label:'Cuenta y seguridad',href:'/dashboard/security',group:'Plataforma'}
 ];
 if(institutionId){
  const base='/dashboard/institutions/'+institutionId;
  if(institutionAdministrationAvailable||hasInstitutionCapability(data,'institutions.manage'))
   quickLinks.push({id:'administration',label:'Administración institucional',href:base+'/admin',group:'Plataforma'});
  if(hasInstitutionCapability(data,'users.read'))
   quickLinks.push({id:'users',label:'Usuarios',href:base+'/users',group:'Plataforma'});
  if(hasInstitutionCapability(data,'roles.assign'))
   quickLinks.push({id:'roles',label:'Roles y ámbitos',href:base+'/roles',group:'Plataforma'});
  if(hasInstitutionCapability(data,'invitations.manage'))
   quickLinks.push({id:'invitations',label:'Invitaciones',href:base+'/invitations',group:'Plataforma'});
  if(academicAvailable)quickLinks.push({id:'academic',label:'Catálogo académico',href:base+'/academic',group:'Gestión académica'});
  for(const module of modules)quickLinks.push({id:module.id,label:module.label,href:base+'/'+module.id,group:'Gestión académica'});
 }
 const crumb=activeModule?activeModule.label:active==='overview'?'Inicio':active==='security'?'Seguridad':active==='academic'?'Catálogo académico':active==='roles'?'Roles y ámbitos':active==='invitations'?'Invitaciones':active==='users'?'Usuarios':active==='administration'?'Administración institucional':'Institución';
 return <>
  <Sidebar collapsible="icon" className="border-sidebar-border bg-sidebar">
   <SidebarHeader className="border-b border-sidebar-border px-3 py-4 group-data-[collapsible=icon]:px-1">
    <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
     <div className="group-data-[collapsible=icon]:hidden"><SiiBrand light/></div>
     <Link href="/dashboard" aria-label="SII, ir al inicio institucional" className="hidden group-data-[collapsible=icon]:grid"><SiiMark compact/></Link>
     <CollapseButton/>
    </div>
   </SidebarHeader>
   <SidebarContent className="px-2 py-3"><nav aria-label="Navegación institucional">
    <SidebarGroup>
     <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
     <SidebarGroupContent>
      <SidebarMenu>
       <ShellLink href="/dashboard" label="Inicio" icon="home" active={active==='overview'}/>
       {institutionId&&(institutionAdministrationAvailable||hasInstitutionCapability(data,'institutions.manage'))&&<ShellLink href={`/dashboard/institutions/${institutionId}/admin` as Route} label="Administración institucional" icon="institution" active={active==='administration'}/>}
       {institutionId&&hasInstitutionCapability(data,'users.read')&&<ShellLink href={`/dashboard/institutions/${institutionId}/users` as Route} label="Usuarios" icon="users" active={active==='users'}/>}
       {institutionId&&hasInstitutionCapability(data,'roles.assign')&&<ShellLink href={`/dashboard/institutions/${institutionId}/roles` as Route} label="Roles y ámbitos" icon="roles" active={active==='roles'}/>}
       {institutionId&&hasInstitutionCapability(data,'invitations.manage')&&<ShellLink href={`/dashboard/institutions/${institutionId}/invitations` as Route} label="Invitaciones" icon="mail" active={active==='invitations'}/>}
       <ShellLink href="/dashboard/security" label="Cuenta y seguridad" icon="shield" active={active==='security'}/>
      </SidebarMenu>
     </SidebarGroupContent>
    </SidebarGroup>
    <SidebarSeparator/>
    <SidebarGroup>
     <SidebarGroupLabel>Gestión académica</SidebarGroupLabel>
     <SidebarGroupContent aria-busy={verifying}>
      <SidebarMenu>
       {institutionId&&academicAvailable?<ShellLink href={`/dashboard/institutions/${institutionId}/academic` as Route} label="Catálogo académico" icon="book" active={active==='academic'}/>:
        <MutedLink label="Catálogo académico" icon="book" unavailableLabel={unavailableLabel} verifying={verifying}/>}
       {allAcademicModuleLinks.map(module=>{
        const allowed=Boolean(institutionId&&modules.some(item=>item.id===module.id));
        return allowed?<ShellLink key={module.id} href={`/dashboard/institutions/${institutionId}/${module.id}` as Route} label={module.label} icon={iconForModule(module.id)} active={active===module.id}/>:
         <MutedLink key={module.id} label={module.label} icon={iconForModule(module.id)} unavailableLabel={unavailableLabel} verifying={verifying}/>;
       })}
      </SidebarMenu>
     </SidebarGroupContent>
    </SidebarGroup>
   </nav></SidebarContent>
   <SidebarFooter className="border-t border-sidebar-border p-3">
    <div className="flex items-center gap-2 rounded-md bg-sidebar-accent/70 px-2 py-2 group-data-[collapsible=icon]:justify-center">
     <Avatar className="size-8 border border-sidebar-border"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">{firstName.substring(0,1).toLocaleUpperCase('es-MX')}</AvatarFallback></Avatar>
     <span className="min-w-0 group-data-[collapsible=icon]:hidden"><strong className="block truncate text-xs text-sidebar-foreground">{fullName}</strong><small className="block truncate text-[10px] text-sidebar-foreground/60">Sesión institucional</small></span>
    </div>
    <p className="mt-2 hidden items-center gap-2 px-1 text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden"><span className="size-1.5 rounded-full bg-emerald-400"/>Plataforma institucional · Acceso protegido</p>
   </SidebarFooter>
  </Sidebar>
  <div className="sii-main flex min-w-0 flex-1 flex-col">
   <header className="sii-topbar">
    <div className="sii-topbar-start">
     <MobileTrigger/>
     <Breadcrumb>
      <BreadcrumbList>
       <BreadcrumbItem className="hidden sm:block"><Link href="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">SII</Link></BreadcrumbItem>
       <BreadcrumbSeparator className="hidden sm:block"/>
       <BreadcrumbItem><BreadcrumbPage className="font-semibold">{crumb}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
     </Breadcrumb>
    </div>
    <div className="sii-topbar-actions">
     <SiiQuickSwitch links={quickLinks}/>
     <Badge variant="secondary" className="hidden gap-1.5 md:inline-flex"><span className="sii-online-dot"/>Sesión autenticada</Badge>
     <SiiThemeToggle/>
     <Avatar className="hidden size-9 sm:flex"><AvatarFallback className="bg-primary-soft text-xs font-bold text-primary">{firstName.substring(0,1).toLocaleUpperCase('es-MX')}</AvatarFallback></Avatar>
     <form action="/api/v1/auth/logout" method="post"><Button type="submit" variant="outline" size="sm" className="gap-1.5">Salir <span aria-hidden="true">↗</span></Button></form>
    </div>
   </header>
   <main id="main-content" tabIndex={-1} className="sii-page">{children}</main>
  </div>
 </>;
}

function CollapseButton(){
 const {open,setOpen,isMobile,setOpenMobile}=useSidebar();
 if(isMobile)return <Button type="button" variant="ghost" size="icon" aria-label="Cerrar navegación" onClick={()=>setOpenMobile(false)} className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><X/></Button>;
 return <Button type="button" variant="ghost" size="icon" onClick={()=>setOpen(!open)} aria-label={open?'Contraer menú lateral':'Expandir menú lateral'} aria-expanded={open}
  className="size-9 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" title={open?'Contraer menú':'Expandir menú'}>
  {open?<PanelLeftClose/>:<PanelLeftOpen/>}
 </Button>;
}

function MobileTrigger(){
 const {openMobile,setOpenMobile,isMobile}=useSidebar();
 const pathname=usePathname();
 const trigger=useRef<HTMLButtonElement>(null);
 const wasOpen=useRef(false);
 useEffect(()=>{setOpenMobile(false);},[pathname,isMobile,setOpenMobile]);
 useEffect(()=>{
  if(wasOpen.current&&!openMobile)trigger.current?.focus();
  wasOpen.current=openMobile;
  if(!openMobile)return;
  const html=document.documentElement,body=document.body;
  const previousHtml=html.style.overflow,previousBody=body.style.overflow;
  html.style.overflow='hidden';body.style.overflow='hidden';
  return ()=>{html.style.overflow=previousHtml;body.style.overflow=previousBody;};
 },[openMobile]);
 return <Button ref={trigger} type="button" variant="ghost" size="icon" onClick={()=>setOpenMobile(!openMobile)} aria-expanded={openMobile} aria-controls="sii-sidebar-mobile" aria-label={openMobile?'Cerrar navegación':'Abrir navegación'} className="sii-menu-button md:hidden">
  <Menu/>
 </Button>;
}

function ShellLink({href,label,icon,active}:{href:Route|string;label:string;icon:SiiNavIconName;active:boolean}){
 return <SidebarMenuItem>
  <SidebarMenuButton asChild isActive={active} tooltip={label} className="h-10 gap-3 text-[13px] font-semibold">
   <Link href={href as Route} aria-current={active?'page':undefined}>
    <SiiNavIcon name={icon}/><span>{label}</span>
   </Link>
  </SidebarMenuButton>
 </SidebarMenuItem>;
}

function MutedLink({label,icon,unavailableLabel,verifying}:{label:string;icon:SiiNavIconName;unavailableLabel:string;verifying:boolean}){
 return <SidebarMenuItem>
  <SidebarMenuButton disabled tooltip={label} className={verifying?'opacity-70':'opacity-60'}>
   <SiiNavIcon name={icon}/><span>{label}</span><span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">{unavailableLabel}</span>
  </SidebarMenuButton>
 </SidebarMenuItem>;
}
