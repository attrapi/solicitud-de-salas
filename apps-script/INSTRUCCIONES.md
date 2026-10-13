# Actualizar la hoja de cálculo (Apps Script)

El archivo `Codigo.gs` de esta carpeta reemplaza el código que hoy tiene tu proyecto de
Apps Script. **No borra nada**: si a una hoja le faltan columnas se las agrega al final,
y si falta una hoja entera (Áreas, Proyectos, Bloqueos) la crea.

## 1. Pegar el código

1. Abre la hoja de cálculo de las salas → menú **Extensiones ▸ Apps Script**.
2. Abre el archivo que ya tenías (normalmente `Código.gs`), selecciona todo y bórralo.
3. Pega completo el contenido de `apps-script/Codigo.gs` y guarda (💾).
4. Menú **Ejecutar** con la función `prepararHojas` seleccionada. La primera vez Google
   pide permiso para que el script use tu hoja: acéptalo.
   Al terminar, la hoja muestra el aviso «Hojas y columnas listas».

## 2. Poner la clave del panel

La clave del panel de administración se guarda aparte del código, para que no quede escrita
en el archivo:

1. En el editor de Apps Script: **Configuración del proyecto** (el engrane de la izquierda).
2. Abajo, **Propiedades de la secuencia de comandos ▸ Agregar propiedad**.
3. Nombre: `CLAVE_ADMIN` · Valor: la clave que quieras. Guardar.

Si no haces este paso, la clave es la que está escrita en `CLAVE_POR_DEFECTO`
(`salas2026`), y conviene cambiarla. Si tu clave anterior estaba en una hoja llamada
`Config`, `Configuración` o `Ajustes` en una fila que diga «clave», el script la sigue
usando sin que tengas que hacer nada.

## 3. Volver a implementar

1. Botón azul **Implementar ▸ Administrar implementaciones**.
2. En la implementación que ya existe, el lápiz ✏️ → **Versión: Nueva versión** → **Implementar**.
3. Verifica que siga diciendo: ejecutar como **yo**, con acceso para **cualquier usuario**.

> Importante: usa **Administrar implementaciones** y no «Nueva implementación», para que la
> URL `/exec` siga siendo la misma y no haya que tocar `API_URL` en `index.html`.

## 4. Comprobar

Abre en el navegador la URL `/exec` de tu aplicación. Debe empezar con
`{"ok":true,"version":2,` y traer `salas`, `reservaciones`, `areas`, `proyectos` y `bloqueos`.

Si algo sale raro, con la clave puedes ver qué hojas y columnas está leyendo:

```
https://script.google.com/macros/s/.../exec?accion=diagnostico&clave=TU_CLAVE
```

## Hojas que usa

| Hoja | Columnas |
|---|---|
| **Reservaciones** | `id`, `sala_id`, `fecha`, `inicio`, `fin`, `nombre`, `tema`, `estatus`, `creado`, `participantes`, `area`, `proyecto`, `notas`, `link_doc`, `link_admin`, `mostrar_proyeccion`, `mostrar_participantes`, `actualizado` |
| **Salas** | `id`, `nombre`, `capacidad` |
| **Areas** | `id`, `nombre` |
| **Proyectos** | `id`, `nombre` |
| **Bloqueos** | `id`, `sala_id`, `tipo`, `mes`, `dias`, `fechas`, `inicio`, `fin`, `motivo`, `descripcion`, `mostrar_tablero` |

Notas:

- `tema` es el **asunto** de la reunión (se dejó con ese nombre para no perder lo que ya
  estaba capturado).
- `estatus`: `pendiente`, `aceptada`, `rechazada`, `en_curso`, `concluida`, `cancelada`.
- Las áreas y los proyectos que alguien escriba en «Otro (especificar)» se agregan solos a
  su hoja, y desde ahí ya aparecen en la lista para todos.
- En **Bloqueos**, un bloqueo por mes se guarda como la lista de fechas concretas que cubre,
  en la columna `fechas` separadas por comas.
