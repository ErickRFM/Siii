# P1 — Revisión de invitaciones

Primera pasada independiente de fuente, sobre la rama dependiente de IAM498c33bb, antes de congelar la entrega final. El revisor no ejecutó SQL, HTTP, Chromium ni pruebas.

Hallazgos importantes:

1. El alta aceptaba username con mayúsculas sin normalizar; login consulta minúsculas, por lo que una invitación aceptada podía crear una cuenta inaccesible.
2. La búsqueda de propietarios legacy usaba SQL trim de espacios, mientras la validación usaba JavaScript trim (incluye tabulaciones y saltos de línea). Podía crearse otra identidad para el mismo email canónico.
3. La UI ofrecía reenviar/revocar sin respetar actions.canResend/canRevoke del backend, incluso para otro emisor o durante cooldown.
4. Con un bearer válido, ausencia de sesión o step-up devolvía INVITATION_UNAVAILABLE, que la UI explicaba como caducidad/revocación. Debe informar el requisito de autenticación propio y conservar la decisión pendiente.

Comprobaciones adicionales del implementador: aceptación por el propio emisor y modificación de un destinatario con perfil protegido debían conservar las restricciones de F07.

Primera ejecución HTTP real: 20 casos, 15 verdes y cinco RED reproducibles (username/login, email legacy con whitespace, requisito de sesión, autoasignación y destinatario superadministrador protegido). Correcciones en validación/handlers y UI en ejecución; segunda pasada y evidencia final pendientes.

Fortalezas revisadas: hash y AAD ligados a tenant/contexto; fragmento del enlace; serialización de email global; concesión original del emisor revalidada; consumo y rollback transaccionales; onboarding MFA restringido; rotación al reenviar; payload/remitente inmutables e idempotencia; lease/CAS que no resucita cancelaciones; aceptación del proveedor distinguida de entrega.

0008 congelada y aplicada por primera vez en p1_invitations_test: SHA256 c0a7dca7509257527d2bcd0bb334d227c01c5d2590ec84a77bb27bf15ee81559. Migraciones 0000–0007 y hashes históricos conservados. La revisión no certifica envío externo, staging, lector humano ni fase P1 completa.

## Seguimiento de correcciones y evidencia dirigida

Los hallazgos de la primera pasada están corregidos en validación, handlers y UI. La suite ampliada final dirigida pasa 38/38 con PostgreSQL local y handlers reales; Chromium dirigido pasa 7/7 con fixtures sintéticas. La normalización de username coincide con login y SQL reconoce el mismo conjunto de whitespace que String.trim para contactos legacy. Los errores de autenticación propios conservan el consentimiento pendiente; autoasignación y destinatario protegido se rechazan. La UI respeta actions.canResend/canRevoke.

Dos regresiones adicionales reprodujeron la divulgación de preview después de revocar bearer o concesión del emisor durante una espera de la consulta institucional. El preview adquiere los locks en orden y vuelve a comprobar token/estado/autoridad después de la espera; ambas pruebas pasan ahora. También se corrigió una fixture de reintento: un timestamp PostgreSQL de precisión superior podía quedar unas fracciones de milisegundo por delante de Date.now(); ahora la fixture declara el evento explícitamente pasado, sin modificar timeouts ni el reloj operativo.

El bootstrap de fragmento se ejecuta antes del router, mantiene el bearer solo en memoria y retira URL/historial antes de que Next capture su URL canónica; la evidencia de privacidad de navegación está incluida en los siete casos Chromium dirigidos. No se efectuó envío externo. La segunda revisión independiente y la verificación completa final siguen pendientes de sus respectivos ejecutores; esta actualización del implementador no las sustituye.

## Segunda revisión de fuente

El revisor independiente cerró la segunda pasada de fuente sin hallazgos materiales pendientes, incluyendo el refresco del contexto de invitación y la protección del fragmento frente a la navegación de Next. Dictamen favorable condicionado a terminar QA final; el revisor no ejecutó SQL, HTTP, Chromium ni CI y no certifica correo externo, lector humano, hosting o staging.

El ejecutor principal confirmó 592/592 unitarias, 177/177 integraciones, typecheck y lint verdes, y repetición de db:migrate con MIGRATIONS_APPLIED. La suite completa de 25 casos Chromium aún estaba en curso al registrar este dictamen. Build, audit, CI y commit final deben añadirse cuando exista evidencia.

Huellas de la fuente revisada: invitation-accept.tsx SHA256 84D0D3286A799102C755F8F610EB69DD0DC27F1F7DE526B53EB169DF3829865F; invitation-flows.spec.ts SHA256 C73F50BB745E98ECC946A0DA66E07C13490FED12AF78EB089C8221D3E56BDB91. Migración 0008 mantiene el hash congelado anterior.

QA final del coordinador (2026-10-15): npm ci, typecheck, lint, 592/592 unitarias, migrador repetido, 177/177 integraciones, 25/25 Chromium, build, audit con cero vulnerabilidades y diff check terminaron con exit 0. Huellas de fuente y SQL coinciden con la segunda revisión. La solicitud temporal de ejecución se liberó; no se modificó el plan de energía. Se mantienen pendientes CI del commit publicado, merge y las validaciones externas expresadas arriba.
