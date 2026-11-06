# Administración por carrera — contrato inicial SIII ↔ Compañero

## Alcance implementado en SIII

La carrera es `academic_programs.id` y pertenece a una institución específica. El rol existente
`coordinator` con `scope_type='program'` es la **delegación administrativa de carrera**.
No se convierte en `admin` institucional. Se admite más de una carrera por usuario
concesionando grants independientes. Solo un `super_admin` institucional vigente
puede asignar o revocar esta delegación, mediante los endpoints de roles existentes.
No hay promoción automática por correo.

`GET /api/v1/institutions/{institutionId}/career-admin/{programId}` entrega una vista
limitada de la carrera. Revalida sesión, membresía, grant y estado institucional en
la consulta. Devuelve alumnos de esa carrera; docentes y secciones solo si existe
vinculación real por inscripciones, no por conjeturas sobre la asignatura.
Cada colección tiene límite de 200 y marca `truncated`; NO debe usarse para
exportación masiva hasta incorporar paginación.

El admin de carrera no puede elevar roles, gestionar cuentas globales, ver otras
carreras ni cambiar el catálogo institucional. La restricción se aplica en
`canGrant`, `canManageTarget`, `readVisibility` y el endpoint, no únicamente en UI.
El nuevo panel administrativo de carrera exige MFA, sin imponerlo a las lecturas
académicas ordinarias de un coordinador. Las operaciones críticas de roles exigen
step-up. SIII conserva el registro de auditoría e invalida sesiones al cambiar grants.

## Compatibilidad / límites operativos

- Una carrera registrada en SIII NO implica por sí sola un grupo de Compañero.
- Profesores sin inscritos de la carrera pueden no aparecer en el reporte inicial.
- La red `UD4-Alumno` es información aportada por el operador, no una prueba de
  conectividad ni credencial; no se inventa ni publica una contraseña Wi-Fi.
- El QR de Wi-Fi y el QR de asistencia son flujos distintos. No se debe emitir
  una sesión de asistencia usando únicamente SSID/IP/MAC.
- La sincronización Android/Ktor↔SIII debe llevar identidad institucional,
  `institutionId`, `programId`, autorización verificada por backend,
  transporte firmado, idempotencia y auditoría; este endpoint es una primera
  lectura institucional, no un contrato completo de escritura bidireccional.
- Los cambios del ERP se deben probar con dos instituciones y al menos dos
  carreras, en QA aislado, antes de habilitar acceso comercial o productivo.

## Alta de la cuenta propietaria

La identidad del propietario se resuelve por correo **verificado** en
`account_email_verifications`, nunca solo por nombre de usuario ni por
metadatos de cliente. Para conceder `super_admin`: MFA enrolado,
aprobación operacional mediante procedimiento privilegiado, sesión invalidada
y auditoría de antes/después. Se hace por entorno (QA y producción) y jamás
desde una API pública. Una cuenta de estudiante puede conservar ese rol si
también recibe autoridad administrativa, pero la experiencia de acceso y
los privilegios efectivos deben estar separados en la UI.

## Próximos bloques que requieren implementación y certificación

1. Administración de carreras en la app de Gestión: selector de carreras
   asignadas, directorio y horarios filtrados, asignación docente y auditoría.
2. Contrato firmado para proyectar grants SIII en Ktor; negar por defecto al
   perder la sincronización o revocarse una asignación.
3. Configuración de Wi-Fi con redes por carrera y QR de conexión generado
   únicamente con credenciales aprobadas; QR de asistencia temporal separado.
4. Pruebas E2E de inicio/cierre de sesión, MFA, FCM, aislamiento entre
   instituciones, dos carreras y alumnos/maestros compartidos.
5. Preparación comercial: tenancy, licenciamiento, auditoría, SLA,
   consentimiento y retención de datos; no activar facturación aún.
