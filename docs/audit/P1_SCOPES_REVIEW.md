
## Primera revisión de permisos

Base MFA3f75897c, worktree p1-iam, migración0007 SHA2566011BFDAB8A8F4F4C1C6D62202BBB5CEACA459BC35FE9CC1AF5BA2ACBA49627C aplicada/repetida en p1_scopes_test. Primera suite backend antes de correcciones:538unitarias y131integraciones verdes; no son evidencia del estado corregido siguiente.

Revisión independiente de fuente encontró dos P2:
1. Catalog visibility revalida grant/session/tenant pero no estado activo del padre programa/campus al consultar. Añadir predicado padre tenant+active en SQL antes paginación y regresiones de desactivación/archivo durante espera.
2. GETmemberships comprueba users.read en preflight pero SELECTPII/fetchgrants posterior no revalida expiración/revocación/sesión/assurance. Añadir revalidación al SQL o lectura transaccional serializada y regresiones reales de espera.

El revisor no ejecutó SQL, servidor ni reproducciones. Actor onboarding sin MFA no equivale a privilegio operativo: grant privilegiado puede provisionarse para configurar factor propio, pero capacidades institucionales quedan denegadas hasta factor+assurance; critical requiere step-up reciente. No se exige factor previo como único modo de provisionar bootstrap/invitados nuevos.

Correcciones y segunda revisión todavía pendientes al registrar esta primera pasada; F06/F08/administración completa siguen pendientes.

## Corrección y segunda pasada

Los dos P2 se corrigieron con siete regresiones reales RED→GREEN: estado activo del padre (dos) y revalidación de lecturas de membresías (cinco). Segunda revisión independiente de fuente favorable, sin nuevos hallazgos materiales. El revisor no ejecutó suites; la evidencia ejecutada por el implementador es 539 unitarias, 139 integraciones y 18 Chromium, además de typecheck, lint, build y audit sin errores.

Huellas de fuente revisadas (SHA256 de archivos del worktree): read-access 1579FFA9C95A595725C44EDC1564006FDF132700372638474B1D576E684F3CCB; catalog-access AE64AE453D64D35EB7401EB3F66AE41B7AEAAFA4C6937D46CA05C786AFE8101D; memberships GET 538A57AA088A6FFDFCFB05553755C4DA060A96D0D906BA72AD8FB0F9DFC87A06; mfa 188A5B50D80C13A43A7BDF06CB1826312400CC6277EF06E32DD0E49B31CCCAC0; mfa-security UI BDE78D3BFC0F0130DABF83CD51FC372D4DE81516B1E497A51476D5C5BA13DD1A. Migración 0007: 6011BFDAB8A8F4F4C1C6D62202BBB5CEACA459BC35FE9CC1AF5BA2ACBA49627C.

Confirmación del commit y CI remotos pendientes hasta publicar la rama. La revisión no certifica cloud, lector manual, F06 o F08.

El revisor confirmó los cinco archivos y 0007 en los blobs de 41d251fe; las diferencias CRLF/LF no modifican contenido. CI posterior encontró un defecto del harness, corregido sólo en tests/support/http-setup.ts: clave MFA efímera compartida entre workers y servidor. Revisión de este cambio y checks del nuevo SHA pendientes.
