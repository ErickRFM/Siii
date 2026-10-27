# SIII V3: portal institucional y consultas seguras

> Ejecutar con superpowers:executing-plans. Especificación: encargo maestro V3 del usuario, fases 00–02 y 06; instrucciones de AGENTS.md.

Base: main 954b4fed0253045a3ff4c6cc674dbed1ff28f038. Producción observada en ese SHA; ningún PR abierto. Compañero main 55a1b99780ddef2cb2e9add7f82f6d6124965628.

## Bloque funcional

- [x] Retirar próximas clases y calendario operativo del portal estudiantil, conservando API y programación oficial para Compañero y docencia.
- [x] Cinco destinos institucionales: Inicio, Académico, Finanzas, Servicios y Perfil. Académico reúne inscripciones, docentes e historial por periodo. Sin módulos administrativos de relleno.
- [x] Consultar recursos secundarios al abrir su sección; no almacenar información personal en almacenamiento persistente. Conservar datos durante actualización autorizada; retirar todo ante fallo de permisos, cambio de actor, sesión, vínculo o ámbito.
- [x] Vincular respuestas paginadas a la misma identidad, expediente y autoridad mediante metadatos de servidor; abortar y descartar respuestas tardías.
- [x] Pruebas HTTP de contexto/IDOR y navegador de navegación, conservación de búsqueda, carga diferida, error, revocación, móvil/temas/axe.
- [ ] Regresión, revisión independiente, PR, CI del SHA exacto, merge y producción por SHA.

## Límites

No DDL requerido para consultas existentes; no reescribir migraciones. No inventar datos, pasarela, documentos oficiales ni contrato de asistencia. Servicios sin operación personal comprobada permanecen descritos con estado honesto hasta implementar su contrato. Los roles multirrol conservan gestión institucional autorizada.

## Revisión

Comprobar cambio de cuenta sin recargar, respuesta de otra sesión/expediente, permisos revocados durante paginación, búsquedas conservadas al refrescar y foco no oculto por navegación inferior. El cierre parcial de este bloque no certifica todo el Plan Maestro V3.
