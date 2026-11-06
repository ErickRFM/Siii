'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchWithTimeout } from '@/shared/client/fetch-with-timeout';

type Person = {
  id: string; firstName: string; lastName: string;
  institutionalEmail: string | null; status: string;
};
type Student = Person & { enrollmentNumber: string };
type Teacher = Person & { employeeNumber: string };
type Section = { id: string; code: string; status: string };
type Directory = {
  program: { id: string; name: string; code: string; level: string; modality: string };
  students: Student[]; teachers: Teacher[]; sections: Section[];
  truncated: { students: boolean; teachers: boolean; sections: boolean };
};

export default function CareerAdministration({ institutionId, programId }: {
  institutionId: string; programId: string;
}) {
  const [data, setData] = useState<Directory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setData(null);
      try {
        const url = `/api/v1/institutions/${institutionId}/career-admin/${programId}`;
        const response = await fetchWithTimeout(url, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        }, 20000);
        if (!response.ok) throw new Error(response.status === 403 || response.status === 404
          ? 'Tu acceso a esta carrera no está vigente o requiere verificar tu seguridad.'
          : 'No fue posible consultar el directorio de la carrera.');
        const value = await response.json() as { data: Directory };
        if (value.data?.program?.id !== programId || !Array.isArray(value.data.students) ||
            !Array.isArray(value.data.teachers) || !Array.isArray(value.data.sections)) {
          throw new Error('El directorio recibido no es válido.');
        }
        if (!controller.signal.aborted) setData(value.data);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error al obtener datos.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [institutionId, programId, retry]);

  if (loading) return <section className="sii-panel" role="status">Consultando la carrera y tus permisos…</section>;
  if (error) return <section className="sii-panel space-y-3"><p role="alert">{error}</p>
    <Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Reintentar</Button>
  </section>;
  if (!data) return null;

  return <div className="space-y-5">
    <section className="sii-panel space-y-2">
      <span className="sii-section-kicker">CARRERA</span>
      <h2 className="font-semibold text-lg">{data.program.name}</h2>
      <p>{data.program.code} · {data.program.level.replaceAll('_', ' ')} · {data.program.modality.replaceAll('_', ' ')}</p>
      <p className="text-sm opacity-75">Los datos muestran únicamente registros institucionales vinculados a esta carrera.</p>
    </section>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[
        { key: 'students', title: 'Estudiantes', value: data.students.length },
        { key: 'teachers', title: 'Docentes vinculados', value: data.teachers.length },
        { key: 'sections', title: 'Secciones', value: data.sections.length },
      ].map(item => <section key={item.key} className="sii-panel">
        <span className="sii-section-kicker">{item.title}</span>
        <p className="text-2xl font-semibold">{item.value}{data.truncated[item.key as keyof Directory['truncated']] ? '+' : ''}</p>
      </section>)}
    </div>
    <section className="sii-panel space-y-3">
      <h2 className="font-semibold">Estudiantes</h2>
      {data.students.length === 0 ? <p>No hay estudiantes registrados en esta carrera.</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="py-2">Matrícula</th><th scope="col">Estudiante</th><th scope="col">Estado</th></tr></thead>
          <tbody>{data.students.map(student => <tr key={student.id} className="border-t border-current/10">
            <td className="py-2">{student.enrollmentNumber}</td>
            <td>{student.firstName} {student.lastName}</td><td>{student.status}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
    <section className="sii-panel space-y-3">
      <h2 className="font-semibold">Docentes con inscripciones de esta carrera</h2>
      {data.teachers.length === 0 ? <p>Aún no hay docentes vinculados mediante secciones con alumnos inscritos.</p> :
        <ul className="space-y-2">{data.teachers.map(teacher =>
          <li key={teacher.id} className="border-b border-current/10 pb-2">{teacher.firstName} {teacher.lastName} · {teacher.employeeNumber}</li>
        )}</ul>}
    </section>
    <section className="sii-panel space-y-3">
      <h2 className="font-semibold">Secciones vinculadas</h2>
      {data.sections.length === 0 ? <p>No hay secciones con alumnos inscritos de esta carrera.</p> :
        <ul className="space-y-2">{data.sections.map(section => <li key={section.id}>{section.code} · {section.status}</li>)}</ul>}
      {(data.truncated.students || data.truncated.teachers || data.truncated.sections) &&
        <p className="text-sm opacity-70">Vista limitada a los primeros 200 registros por categoría. No se muestran totales globales.</p>}
    </section>
  </div>;
}
