'use client';

import React from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { SiiPanel, SiiStatusBadge } from '@/components/ui/sii-institutional';

export interface SystemRoleMatrixProps {
  capabilities?: readonly string[];
  canAssign?: boolean;
}

const ROLES_CATALOG = [
  {
    role: 'super_admin',
    label: 'Administrador Global',
    description: 'Acceso total a la plataforma, tenant management y auditoría global.',
    tone: 'rose' as const,
  },
  {
    role: 'admin',
    label: 'Administrador Institucional',
    description: 'Gestión de configuración, miembros, invitaciones y catálogos de la institución.',
    tone: 'amber' as const,
  },
  {
    role: 'coordinator',
    label: 'Coordinador Académico',
    description: 'Gestión de programas, planes de estudio, docentes y periodos académicos.',
    tone: 'blue' as const,
  },
  {
    role: 'teacher',
    label: 'Docente',
    description: 'Acceso a grupos asignados, pase de lista, evaluación y rectificaciones.',
    tone: 'green' as const,
  },
  {
    role: 'student',
    label: 'Estudiante',
    description: 'Consulta de kárdex, inscripciones, finanzas, servicios y horario.',
    tone: 'blue' as const,
  },
];

export function SystemRoleMatrix({ _capabilities, _canAssign }: { _capabilities?: readonly string[]; _canAssign?: boolean }) {
  return (
    <SiiPanel className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-amber-500" />
            <h2 className="text-lg font-bold tracking-tight">Matriz de Roles y Capacidades</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Definición de roles de sistema y permisos por ámbito institucional.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES_CATALOG.map((item) => (
          <div
            key={item.role}
            className="p-4 rounded-xl border bg-card/60 space-y-2 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm tracking-tight">{item.label}</h3>
                <SiiStatusBadge variant="active">{item.role}</SiiStatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>

            <div className="pt-2 text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              <span>Capacidades pre-configuradas</span>
            </div>
          </div>
        ))}
      </div>
    </SiiPanel>
  );
}
