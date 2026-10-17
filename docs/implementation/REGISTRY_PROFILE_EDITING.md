# Edición de expedientes — bloque acotado

Objetivo: corregir nombre, apellidos y correo institucional de estudiantes y docentes existentes desde la interfaz. Se conserva el identificador del expediente, matrícula/número de empleado, programa, estado y vínculos. El perfil institucional no modifica cuentas ni personas globales.

Contrato: PATCH registry/:resource acepta la variante estricta `{kind:'profile',id,expected:{firstName,lastName,institutionalEmail},profile:{firstName,lastName,institutionalEmail}}`. `expected` contiene la última lectura; se bloquea la fila y se rechaza una edición concurrente con409 antes de escribir. El PATCH de estado existente conserva su contrato. Mismos permisos institucionales del registro; origin y autoridad se revalidan en servidor. Auditoría de campos antes/después en la misma transacción.

Secuencia: prueba HTTP negativa/positiva y concurrencia → validación y handler → formulario accesible con cancelar, error y borrador conservado → prueba Chromium con persistencia/recarga → suites y revisión → PR/CI/merge. No requiere cambios de esquema ni migración.

Límites: este bloque no habilita cambios de programa, identificadores, inscripción ni historial dedicado; siguen en el backlog.

Evidencia: RED real6fallos/1aprobado antes del handler; API corregida23pruebas dirigidas y suite completa308/308 (25archivos, PostgreSQL17 desechable).765unitarias, typecheck y lint correctos. Chromium reprodujo la ausencia de editor y la revisión detectó pérdida de foco al guardar, corregida mediante referencias al botón renderizado y fallback a búsqueda. El árbol reconciliado con grupos paginados aprobó56Chromium, incluido guardar/cancelar con foco, filtro que oculta la fila, axe, recarga, logout/login y recuperación de errores.

La comprobación adicional sobre el servidor de producción local detectó que fixtureCookie sólo extraía nombres de desarrollo y descartaba __Host-siii_session/challenge:dos suites no alcanzaron sus casos. Regresión unitaria RED1/2→GREEN2/2; corregido sólo el fixture y preservados nombres/atributos reales de cookies. Los16casos HTTP de perfiles y secciones pasaron sobre el build de producción. No se modificaron datos productivos.
