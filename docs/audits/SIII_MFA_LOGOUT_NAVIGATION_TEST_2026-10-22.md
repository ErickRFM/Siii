# QA: esperar el logout real en el flujo MFA

Base main809c526d,22octubre2026. Sólo cambia el último logout del primer caso de tests/ui/mfa-flows.spec.ts. No cambia código de autenticación, permisos, sesiones ni backend.

## Reproducción y causa

CI39815790688,job119953929395, sobre #86@3d9a7e41, falló en credentials(page), caller107: page.goto('/login') fue interrumpido por otra navegación a la misma URL. El caso acababa de enviar el formulario Salir y empezaba otro goto antes de terminar el303. Su primer logout ya esperaba login; el último no. Log original preservado en workspace principal `.p0-local/pr86-first-ci-failure.log`1247–1262 y en Actions. El fallo de contraste del mismo job es independiente y se trata en #87.

La prueba registra page.waitForURL('**/login') antes del clic con Promise.all. Espera la carga de la navegación real y comprueba auth/me401 antes de intentar nuevas credenciales. Conserva cada aserción de enrolamiento, cookies, códigos de un uso, step-up, renovación, revocación, accesibilidad y destino final. Ningún timeout aumenta ni se captura/ignora un error de navegación. El handler real revoca/audita en transacción y responde303 con cookies limpiadas; no se sustituye con un mock.

## Evidencia local y límites de repetición

Worktree nuevo mfa-logout-navigation-test, rama test/mfa-logout-navigation-20261022. PostgreSQL17 local127.0.0.1:55439, bases sintéticas nuevas siii_mfa_navigation_test e isolated_1/2/3_test bajo el mismo prefijo. Sólo migraciones existentes0000–0024. Puerto exclusivo3207; configuración ignorada importa harness original, limita archivo y cambia rutas/puerto. Se conserva la política del servidor.

- npm ci:375paquetes,audit0; aviso basal allow-scripts conservado.
- npm run lint/typecheck:exit0.
- npm test final:826/826,56archivos,9.23s.
- Un primer unitario de guard de migración agotó5000ms en proceso local (825/826). Sin cambios a fuente/plazo, su repetición aislada pasó5/5,4.74s, y la suite completa posterior aprobó. No se atribuye causa concluyente ni se cuenta aquel intento como aprobado.
- Primera repetición con --repeat-each3 sobre una sola DB:5/12. La primera vuelta4/4 pasó; la segunda alcanzó429 en verificación MFA y las siguientes pruebas alcanzaron el throttle compartido. La evidencia queda conservada. No se cambió ni limpió el throttle para fabricar aprobación.
- Repetición final: tres ejecuciones independientes del archivo completo, cada una con su base recién creada y migrada, como entre jobs de CI.4/4 +4/4 +4/4,1.2/1.1/1.1min incluyendo sus builds de producción exclusivos31páginas. Total12 flujos reales aprobados con el guard de logout y401. Sin --repeat-each, mocks nuevos ni relajación de límites.
- Revisión independiente del delta/log:sin Critical/Important/Minor; sólo lectura, sin atribuirle los gates del autor.

Comando final por cada base sintética: `npm run test:ui -- --config .p0-local/mfa-navigation.playwright.config.ts --output .p0-local/mfa-navigation-isolated-N-results`. Logs y traces finales `.p0-local/mfa-navigation-isolated-{1,2,3}*`; intentos anteriores bajo mfa-navigation-unit.log y mfa-navigation-ui.log. Los destinos originales siguen preservados, sin sobrescribir evidencia fallida.

CI global del SHA publicado, reconciliación con la reparación de main e integración siguen pendientes. La repetición controlada no prueba ausencia universal de flakiness ni corrige el contraste de #87. Sin migraciones productivas, envío real de correo, cambios F2 o sincronización.

## Composición con main después de #87

Merge normal de main@a1c6e8c en31cb110f, sin modificar el guard MFA revisado. Se preservó el prefijo completo de la auditoría al resolver su único conflicto de anexos. En una cuarta base nueva siii_mfa_navigation_composed_test, migrada0000–0024, el mismo archivo real aprobó4/4 (1.2min, incluido build31páginas); lint/typecheck exit0 y826/826unitarios (56archivos,6.92s). Logs mfa-navigation-composed-{migrate,lint,types,unit,ui}. No se cuentan los intentos fallidos anteriores como aprobados. La ejecución remota del nuevo SHA sigue pendiente.
## Preparación de DEP02 junto al guard MFA

Composición local0834b352 de #88 con #89@01a595626f97a2b399892d03aeaf08bba80e5396; todavía no acredita ambos PR integrados en main. Sólo cambia la dependencia revisada Next15.5.28 y su documentación; guard MFA idéntico al publicado. Nueva DB siii_mfa_navigation_next_test,0000–0024; npmci375paquetes/audit0,rebuildargon2/esbuild,lint/typecheck y826/826unitarios (56archivos,10.09s). El build de producción y los4/4flujos MFA reales aprobaron en2.3min, puerto3207. Logs mfa-next-{install,rebuild,migrate,lint,types,unit,ui}. Se conserva el CI previo39823279079 fallido sólo por audit:826unit/485integration/88UI/build aprobados, sin contarlo como verde. Falta merge seguro de DEP02 y verificación remota del SHA final de #88.