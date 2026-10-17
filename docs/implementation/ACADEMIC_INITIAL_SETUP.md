# Guía de preparación inicial de catálogos

La página del catálogo académico muestra una guía compacta para campus, programas, materias, planes y periodos. Cada paso consulta el endpoint GET existente del catálogo con `limit=1`, sin caché, dentro de los permisos y el ámbito que valida el servidor.

- **Con registros** significa que la consulta autorizada devolvió al menos un registro. No indica un total ni confirma que la institución esté lista para operar; incluye los estados de registro que devuelve el catálogo.
- **Sin registros en tu ámbito** solo aparece después de una respuesta válida y vacía.
- **No se pudo consultar** conserva el estado desconocido ante errores HTTP, de conexión, formato o tiempo de espera; permite reintentar.
- Sin permiso de lectura no se consulta el catálogo ni se ofrece un botón para abrirlo. Los usuarios de consulta pueden navegar sin recibir controles de escritura. Los permisos de edición siguen perteneciendo al formulario y a la API actuales.

Los botones abren las pestañas existentes y trasladan el foco de teclado. Las altas y modificaciones exitosas vuelven a consultar la presencia guardada. Las consultas se cancelan al desmontar la guía o cambiar institución, permisos o revisión.

Para crear un plan se necesita un programa activo dentro del ámbito autorizado. Esta guía no configura relaciones plan-materia, no importa CSV/XLSX, no añade endpoints ni modifica el esquema. Tampoco bloquea los CRUD existentes.

## Evidencia automatizada

`tests/unit/academic-setup-presence.test.ts` comprueba presencia, catálogo vacío, fallos HTTP, formato inválido, desconexión y cancelación. `tests/ui/academic-initial-setup.spec.ts` cubre catálogo vacío → alta real de campus → verificación SQL → recarga, reintento, consulta sin escritura, grants por programa y revisión axe. Todos los datos de esas pruebas son sintéticos y se restringen a PostgreSQL local de pruebas.

Validación local previa al commit: `npm run typecheck`, `npm run lint` y `npm test` pasan (36 archivos, 729 pruebas). Se observó primero el fallo por el helper todavía inexistente y luego pasaron sus 7 casos. La ejecución de navegador, el build de producción y la prueba persistente de extremo a extremo quedan **pendientes de la validación conjunta en la rama integradora**; este documento no los declara aprobados.

### Cambio de ámbito sin cambio de recursos visibles

La guía, la tabla y el selector de programas se invalidan cuando cambia la identidad estable del acceso: institución, membresía, grants (id, perfil, ámbito y vigencia), capacidades institucionales o capacidades por ámbito. El orden de las listas del servidor no altera esa identidad. La frescura de MFA/step-up queda fuera de la firma para conservar los borradores cuando los permisos y el ámbito siguen iguales.

Al cambiar la firma se cancelan lecturas obsoletas, se limpian filas y opciones previas, se reinicia la paginación y se descarta el editor del ámbito anterior. Los formularios de alta también reinician sus campos. La autoridad de cada operación permanece en la API.

Pruebas añadidas primero: `tests/unit/catalog-access-key.test.ts` (12 casos) y regresión de navegador en `tests/ui/academic-initial-setup.spec.ts` que mueve un grant real entre programas A/B con los mismos recursos legibles, comprueba presencia, filas, selector y conservación del borrador tras foco sin cambio de ámbito. La suite unitaria completa pasa con 765 pruebas; la ejecución de esa nueva regresión de navegador queda pendiente de la validación conjunta en la rama integradora.

Una falla temporal de capacidades oculta el formulario y conserva el último ámbito confirmado: recuperar ese mismo ámbito no descarta el borrador del editor. Solo una proyección autorizada nueva con una firma distinta confirma el cambio e invalida el estado anterior.
