# Revisión de solicitudes de vinculación de expediente

Cierra el hallazgo A2 de la auditoría E2E SIII → Compañero (2026-11-23): las solicitudes creadas por
`POST /api/v1/institutions/{id}/student-links/claim` sin coincidencia verificada de correo quedaban en
`pending` sin ninguna vía para resolverlas.

## API

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/api/v1/institutions/{institutionId}/student-links/claims` | `users.manage` (asegurado: MFA y step-up) |
| `PATCH` | `/api/v1/institutions/{institutionId}/student-links/claims/{claimId}` | `users.manage` (asegurado) + mismo origen |

`PATCH` acepta exactamente uno de estos cuerpos:

- `{"decision":"approve"}`
- `{"decision":"reject","reason":"…"}` (motivo de 3 a 500 caracteres)

**Aprobación:** dentro de `domainTransaction`, con bloqueo de la solicitud, la membresía y el expediente,
crea el mismo `student_account_links` que la autovinculación, con `linked_by` = revisor. Marca la solicitud
como `approved` y audita `student.claim.approved`.

**Rechazo:** marca `rejected` con `rejection_reason` y audita `student.claim.rejected`. Nunca crea un vínculo.

## Fallos cerrados

| Código | Estado | Causa |
|---|---|---|
| `CLAIM_UNAVAILABLE` | 404 | La solicitud ya fue resuelta, no existe o pertenece a otra institución |
| `SELF_REVIEW_NOT_ALLOWED` | 403 | El revisor es el solicitante |
| `ALREADY_LINKED` | 409 | El expediente o la membresía ya tienen un vínculo activo; la solicitud sigue `pending` |
| `STUDENT_NOT_FOUND` / `STUDENT_NOT_ACTIVE` | 422 | No hay expediente activo con esa matrícula |
| `APPLICANT_MEMBERSHIP_INACTIVE` | 422 | La cuenta solicitante perdió su membresía activa |

Dos aprobaciones concurrentes de la misma solicitud producen un solo vínculo y una sola auditoría.

## UI

Panel «Solicitudes de vinculación pendientes» en *Personas académicas* (`/registry`). Solo se muestra a
quien tiene `users.manage`, y la API vuelve a comprobarlo. Muestra la evidencia que comparó la regla
automática: correo verificado o correo de perfil frente al correo institucional del expediente.

## Decisión pendiente

El mensaje que ve el estudiante dice «Solicitud enviada a Control Escolar», pero el rol `control_escolar`
no tiene `memberships.manage`. Hoy solo `admin` y `super_admin` pueden resolver. Ampliarlo requiere una
decisión explícita sobre permisos.

## Pruebas

`tests/integration/student-claim-review-http.test.ts`
