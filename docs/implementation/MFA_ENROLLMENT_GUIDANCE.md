# Ayuda de activación TOTP — 2026-10-17

## Cambio y contrato

La activación explica tres pasos: crear la cuenta manual TOTP/SHA-1/6 dígitos/30 segundos en una aplicación autenticadora, copiar allí la clave completa y escribir en Siii los seis números que genera la aplicación. La clave manual se identifica explícitamente como distinta del código.

El campo conserva inputMode numeric, patrón [0-9]{6}, autocompletado de código y validación del servidor. Su ayuda permanece asociada con aria-describedby. Letras o longitud incorrecta reciben una indicación local comprensible y no generan POST /mfa/verify ni consumen intentos. Se permiten pegar y gestores de contraseñas.

Reiniciar activación oculta la clave y devuelve el foco a la contraseña. La clave pendiente se sustituye cuando el usuario confirma su contraseña y completa de nuevo el endpoint existente de enrollment. No se introduce un endpoint de cancelación ni se afirma que ocultarla la haya revocado. No cambian políticas, permisos, cifrado, auditoría, límites o contratos del backend.

Archivos: src/components/mfa-security.tsx y tests/ui/mfa-enrollment-guidance.spec.ts. Sin esquema, migración ni dependencia nueva.

## Evidencia local

- RED real de Chromium antes de implementar: el código carecía de aria-describedby permanente y falló la nueva prueba.
- GREEN: npx playwright test --config .p0-local/mfa-guidance-playwright.config.mjs — 1/1 (1.9 min), con build de producción previo. Cuenta y PostgreSQL sintéticos propios, puerto 3108.
- El test escribe un fragmento alfabético de la clave mediante eventos de teclado y después tres números: mensaje asociado, cero POST verify y attempts=0 en la base. Reinicia, comprueba contraseña/foco y sustitución de la clave pendiente, envía TOTP real y recibe 10 códigos de recuperación. Axe: cero infracciones.
- npm test -- --maxWorkers=1 — 38 archivos, 765/765 aprobadas. La primera ejecución concurrente con build tuvo un timeout de 5 s en migration-safety; su repetición secuencial completa pasó.
- npm run typecheck y npm run lint — correctos. Build de producción completado por el setup de Chromium.
- La integración HTTP completa no se repitió localmente para este cambio de presentación. CI y revisión del SHA publicado pendientes antes de merge.

## Base y despliegue

PR36 está integrado en main mediante dccdb2b78e9bbf32c3aa05a2fa86b39e07f4ba1c tras ambas ejecuciones Verify SIS SUCCESS. Esta rama utiliza su corrección de puerto configurable para aislar la prueba del servidor 3107 de otros trabajos.

PR35 ya había sido validado con 765 unitarias, 300 integraciones y 54 pruebas Chromium. El responsable de integración informó su despliegue READY y respuestas 200 del alias y /api/health/ready a las 22:37:38 UTC. Esa evidencia corresponde al portal integrado anterior; esta nueva ayuda TOTP todavía requiere PR, CI verde, revisión y despliegue.

No se usaron cuentas, claves ni datos de producción. El reinicio de una clave real expuesta se gestiona por separado y no forma parte de la fixture.
