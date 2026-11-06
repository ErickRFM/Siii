'use client';

import React, { useState, useEffect } from 'react';
import { Users, ShieldAlert } from 'lucide-react';
import { SiiPanel, SiiStatusBadge } from '@/components/ui/sii-institutional';
import { Input } from '@/components/ui/input';

export interface SystemUserGovernanceProps {
  institutionId: string;
  _online?: boolean;
  canManage: boolean;
}

export function SystemUserGovernance({
  institutionId,
  _online,
  canManage,
}: SystemUserGovernanceProps) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<
    Array<{
      id: string;
      fullName: string;
      email: string;
      role: string;
      status: 'active' | 'suspended' | 'inactive';
      verifiedEmail?: string;
    }>
  >([]);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/v1/institutions/${institutionId}/memberships?limit=20`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return { data: [] };
        return res.json();
      })
      .then((res) => {
        if (!controller.signal.aborted && res.data) {
          setMembers(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [institutionId]);

  const filtered = members.filter(
    (m) =>
      m.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.role?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SiiPanel className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-sky-500" />
            <h2 className="text-lg font-bold tracking-tight">Gobierno de Usuarios y Membresías</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Directorio institucional, seguridad de sesión y reseteo de accesos.
          </p>
        </div>

        <Input
          type="search"
          placeholder="Buscar por usuario, correo o rol…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {!canManage && (
        <div className="p-3 text-xs rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0" />
          <span>No cuentas con permisos suficientes para modificar usuarios de esta institución.</span>
        </div>
      )}

      {loading ? (
        <p role="status" className="text-sm text-muted-foreground p-6 text-center">
          Cargando directorio de usuarios…
        </p>
      ) : !filtered.length ? (
        <p role="status" className="text-sm text-muted-foreground p-8 text-center italic">
          No hay miembros coincidentes en esta institución.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => (
            <div
              key={member.id}
              className="p-4 rounded-xl border bg-card/60 space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm truncate">{member.fullName}</h3>
                  <SiiStatusBadge variant={member.status === 'active' ? 'active' : 'archived'}>
                    {member.status === 'active' ? 'Activo' : 'Suspendido'}
                  </SiiStatusBadge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                <p className="text-xs font-mono text-primary font-medium uppercase tracking-wider pt-1">
                  Rol: {member.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SiiPanel>
  );
}
