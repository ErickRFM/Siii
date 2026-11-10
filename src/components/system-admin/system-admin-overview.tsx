'use client';

import React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  ShieldAlert,
  Building2,
  Users,
  KeyRound,
  FileCheck2,
  Activity,
  ArrowUpRight,
  Clock,
  Layers,
  Settings2,
} from 'lucide-react';
import type { InstitutionAdminDTO } from '@/shared/institution-admin/policy';
import { SiiMetric, SiiStatusBadge, SiiPanel } from '@/components/ui/sii-institutional';
import { Button } from '@/components/ui/button';

export interface SystemAdminOverviewProps {
  institution: InstitutionAdminDTO;
  businessAvailable: boolean;
  academicAvailable: boolean;
  capabilities: readonly string[];
  online: boolean;
  onReload: () => void;
  loading: boolean;
}

export function SystemAdminOverview({
  institution,
  businessAvailable,
  academicAvailable,
  capabilities,
  online,
  onReload,
  loading,
}: SystemAdminOverviewProps) {
  const statusVariantMap: Record<
    InstitutionAdminDTO['status'],
    'active' | 'pending' | 'archived' | 'cancelled'
  > = {
    active: 'active',
    inactive: 'pending',
    suspended: 'cancelled',
    archived: 'archived',
  };

  const statusLabelMap: Record<InstitutionAdminDTO['status'], string> = {
    active: 'Operativa',
    inactive: 'Inactiva',
    suspended: 'Suspendida',
    archived: 'Archivada',
  };

  const formattedDate = new Date(institution.updatedAt).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="sii-system-admin-overview space-y-6">
      {/* Top Banner & Status Header */}
      <SiiPanel variant="hero" className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Activity className="size-4 text-emerald-500 animate-pulse" />
            <span>Centro de Control de Administración</span>
            <span className="text-border">•</span>
            <span>Versión {institution.version}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
              {institution.name}
            </h2>
            <SiiStatusBadge variant={statusVariantMap[institution.status]}>
              {statusLabelMap[institution.status]}
            </SiiStatusBadge>
          </div>

          <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Clave: <strong className="text-foreground font-mono">{institution.code}</strong></span>
            <span>•</span>
            <span>Zona horaria: <strong className="text-foreground">{institution.timezone}</strong></span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>Última actualización: {formattedDate}</span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !online}
            onClick={onReload}
            className="gap-2"
          >
            <Activity className="size-4" />
            <span>{loading ? 'Consultando…' : 'Recargar estado'}</span>
          </Button>
        </div>
      </SiiPanel>

      {/* KPI Metrics Dashboard Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SiiMetric
          label="Estado Operativo"
          value={statusLabelMap[institution.status]}
          tone={institution.status === 'active' ? 'green' : 'amber'}
          icon={<Building2 className="size-5" />}
          description={
            institution.status === 'active'
              ? 'Todas las operaciones institucionales activas'
              : 'Operaciones restringidas por estado administrativo'
          }
        />
        <SiiMetric
          label="Revisión de Seguridad"
          value={`v${institution.version}`}
          tone="blue"
          icon={<ShieldAlert className="size-5" />}
          description="Secuencia de auditoría verificada en PostgreSQL"
        />
        <SiiMetric
          label="Catálogo Académico"
          value={academicAvailable ? 'Habilitado' : 'Restringido'}
          tone={academicAvailable ? 'green' : 'terracotta'}
          icon={<Layers className="size-5" />}
          description="Programas, planes, materias y periodos"
        />
        <SiiMetric
          label="Zona Horaria IANA"
          value={institution.timezone.split('/')[1] ?? institution.timezone}
          tone="amber"
          icon={<Settings2 className="size-5" />}
          description={institution.timezone}
        />
      </div>

      {/* Quick Access Sub-system Navigation */}
      {businessAvailable && (
        <SiiPanel className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold tracking-tight">
              Módulos de Gestión de Plataforma
            </h3>
            <span className="text-xs text-muted-foreground">Acceso por capacidades vigentes</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {academicAvailable && (
              <Link
                href={`/dashboard/institutions/${institution.id}/academic` as Route}
                className="group flex flex-col justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all"
              >
                <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary mb-3">
                  <Layers className="size-5" />
                  <ArrowUpRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Control Escolar
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Campus, programas, planes de estudio y materias.
                  </p>
                </div>
              </Link>
            )}

            {capabilities.includes('users.read') && (
              <Link
                href={`/dashboard/institutions/${institution.id}/users` as Route}
                className="group flex flex-col justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all"
              >
                <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary mb-3">
                  <Users className="size-5" />
                  <ArrowUpRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Usuarios y Membresías
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Directorio institucional, perfiles y reseteo de accesos.
                  </p>
                </div>
              </Link>
            )}

            {capabilities.includes('roles.assign') && (
              <Link
                href={`/dashboard/institutions/${institution.id}/roles` as Route}
                className="group flex flex-col justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all"
              >
                <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary mb-3">
                  <KeyRound className="size-5" />
                  <ArrowUpRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Matriz de Roles
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Asignación y revocación de permisos por ámbito.
                  </p>
                </div>
              </Link>
            )}

            {capabilities.includes('invitations.manage') && (
              <Link
                href={`/dashboard/institutions/${institution.id}/invitations` as Route}
                className="group flex flex-col justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all"
              >
                <div className="flex items-center justify-between text-muted-foreground group-hover:text-primary mb-3">
                  <FileCheck2 className="size-5" />
                  <ArrowUpRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    Invitaciones y Altas
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reenvíos, estado de entrega e historial de accesos.
                  </p>
                </div>
              </Link>
            )}
          </div>
        </SiiPanel>
      )}
    </div>
  );
}
