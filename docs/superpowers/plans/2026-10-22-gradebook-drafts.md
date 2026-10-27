# Borradores locales del libro de calificaciones

Diseño aprobado por el usuario mediante coordinación del agente principal. Base main63c237fa; reproducción original9b472c30 preservada. Sin cambios a backend, auth, migraciones, estilos ni contratos.

1. Ampliar primero negativos reales sobre las tres reproducciones: revisión durante confirmación, salida por enlaces/recarga/cierre, dos secciones y pérdida de autoridad.
2. Mantener borradores controlados en memoria por institución/sección/alumno/componente y revisión; retirar exclusivamente la revisión enviada que el servidor confirmó.
3. Refrescar sin desmontar la tabla de la misma sección, descartar respuestas tardías y retirar privados ante401/403. Recuperar borradores de otra sección sólo tras lectura autorizada.
4. Bloquear publicación pendiente y comprobar otra vez después de ask. Reutilizar confirmaciones locales y beforeunload; no interceptar historial SPA.
5. Verificar lint, tipos, unitarias, build y UI focal sobre PostgreSQL sintético55439/siii_gradebook_test y producción local3204. Añadir capturas pobladas claro/escritorio y oscuro390, axe y teclado. Conservar RED separado.
6. Actualizar reporte/matriz/auditoría con límites precisos, pedir revisión independiente y consolidar commit local sólo con gates y revisión aprobados. Sin push/PR/merge/producción.
