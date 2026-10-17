# Correcciones de experiencia MFA y permisos (2026-10-17)

## Cambios

- `src/shared/auth/security-return.ts` valida un UUID con formato completo y una ruta institucional existente. Cuenta y seguridad conserva el regreso a registry, operations, grading, scheduling y services, además de las pantallas administrativas previas. Se rechazan URLs externas, consultas, fragmentos, traversal y rutas desconocidas.
- `src/components/institution-capabilities.tsx` vuelve a consultar el endpoint real al recuperar foco, visibilidad o conexión. Deduplica solicitudes simultáneas y conserva los formularios durante la consulta en segundo plano. Un fallo elimina la proyección anterior de permisos y permite reintentar. Si la revalidación en segundo plano comienza después de un fallo, conserva el error conocido hasta que la respuesta confirme los permisos; evita presentar un estado falso de acceso vacío.
- `src/components/mfa-security.tsx` muestra el enlace para iniciar sesión exclusivamente ante `UNAUTHENTICATED`. Un fallo de configuración o servicio MFA conserva su explicación propia.
- La autorización continúa en los endpoints existentes. Estos cambios no modifican esquema, migraciones, endpoints, secretos, cookies ni políticas MFA.

## Evidencia de regresión

- El validador previo falló 6 de 24 casos: descartaba los cinco módulos nuevos y aceptaba un identificador de 36 guiones. Tras la corrección pasan los 24 casos.
- Chromium reprodujo que `MFA_KEY_UNAVAILABLE` incluía un enlace de acceso injustificado y que recuperar foco no consultaba capacidades. Las pruebas ejercitan la UI real; solo los casos de error y respuesta diferida interceptan HTTP.
- La prueba de sesión entre pestañas usa enrollment, TOTP, códigos de recuperación y step-up reales contra PostgreSQL sintético local. Comprueba la proyección del servidor tras ambas rotaciones de sesión.

## Verificación local

- `npm ci --ignore-scripts`: 375 paquetes instalados, 0 vulnerabilidades.
- `npm test`: 36 archivos, 746 pruebas aprobadas.
- `npm run typecheck` y `npm run lint`: salida 0.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- El setup de `npm run test:ui -- tests/ui/mfa-flows.spec.ts tests/ui/permission-scopes.spec.ts` ejecutó `next build` de producción satisfactoriamente. La primera ejecución completa aprobó 9/12 casos: encontró el defecto de axe descrito abajo y dos detalles del nuevo harness (selector ambiguo con el anunciador de Next.js y ausencia de foco nativo entre pestañas en Chromium sin interfaz).
- Tras acotar la alerta a `main` y entregar el evento `focus` explícitamente, el retest de las tres regresiones de MFA/permisos aprobó 3/3 en 8.5 segundos reutilizando el build de producción. Las operaciones MFA y las rotaciones de sesión permanecen reales.

La revisión independiente añadió una regresión 403 → recuperación por foco con respuesta diferida. Ese tramo nuevo se entrega para la ejecución consolidada junto con la corrección del shell, sin ocupar el servidor de validación de la rama principal durante su trabajo.

Las pruebas UI completas de esta rama también detectaron un fallo previo de axe en `sii-app-shell.tsx`: el contenedor `div` de Gestión académica usa `aria-label` sin un rol permitido. La corrección de ese archivo pertenece a la rama principal de la misión; el resultado combinado debe verificarse allí.

## Límites y entrega

No se realizaron escrituras en producción ni cambios de configuración cloud. La suite de integración completa y el CI del commit integrado corresponden a la validación consolidada de la misión. No se ha solicitado push ni merge para esta rama independiente.

La actualización de capacidades es presentación: durante la consulta en segundo plano el endpoint sigue revalidando cada operación; ante un error la interfaz deja de ofrecer las acciones anteriores. No se introducen permisos ni excepciones de MFA.
