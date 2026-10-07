# Contrato de RPCs `ai_*`

> **Estado: cerrado.** Implementado y aplicado en el Supabase de ACM
> (`xnkuuxbnxqrugfzuumdg`), migración `20261006120000_ai_rpcs_v1.sql` en el repo
> de ACM. Las tools de `apps/api/src/tools/` se escriben contra estas firmas.

El backend del asistente nunca consulta tablas: solo llama funciones RPC con
nombre, parámetros y forma de respuesta **idénticos en los 8 sistemas**. Lo que
cambia entre ERPs es el SQL interno de cada función, no su firma.

## Reglas que toda RPC `ai_*` debe cumplir

1. `security invoker` — hereda `auth.uid()` del llamador, así RLS aplica.
   Nunca `security definer` para datos del cliente.
2. Prefijo `ai_` y nombre en español, en singular o plural según el caso
   (`ai_ventas_periodo`, `ai_buscar_venta`).
3. Parámetros nombrados, todos con `default null`, y fechas como `date` en la
   zona horaria del sistema.
4. Devuelve `jsonb` con la forma fija de abajo.
5. Límite de filas propio, acotado a 1..200, y el conteo de las filas omitidas
   en la respuesta.
6. `revoke all ... from public, anon` + `grant execute ... to authenticated`.
7. Gate de rol/permiso al inicio del cuerpo, que levanta `no_autorizado` con
   `errcode = '42501'`.
8. **Ninguna expone nómina, sueldos ni datos de empleados.**

## Forma de la respuesta

Las ocho devuelven el mismo sobre:

```json
{
  "resumen":  { "hoy": "2026-10-06", "...": "agregados del periodo COMPLETO" },
  "filas":    [ { "...": "el detalle, acotado por el límite" } ],
  "omitidas": { "por_limite": 0, "limite_usado": 50, "devueltas": 12, "nota": "…" }
}
```

Lo importante de esa separación: **`resumen` cubre el total, `filas` viene
acotado.** Un total nunca se calcula sumando `filas`. Cuando
`omitidas.por_limite` es mayor que cero, el asistente tiene que decir que la
lista está recortada (está en las reglas base del system prompt).

`ai_mis_permisos` y `ai_resumen_semana` agregan `omitidas.por_permiso`: los
nombres de funciones o los bloques que el usuario no puede ver. Un bloque en
`null` por permiso **no es cero**, y el prompt lo dice explícitamente.

## Catálogo y firmas

Todas con `p_limite integer default <n>`, acotado a 1..200 dentro de la función.

| RPC | Parámetros | Gate |
|---|---|---|
| `ai_mis_permisos()` | — | cualquier usuario autenticado |
| `ai_ventas_periodo` | `p_desde date`, `p_hasta date`, `p_cliente text`, `p_producto text`, `p_limite=50` | `ADMIN` \| `VENTAS` |
| `ai_buscar_venta` | `p_monto numeric`, `p_fecha date`, `p_cliente text`, `p_producto text`, `p_folio text`, `p_limite=20` | `ADMIN` \| `VENTAS` |
| `ai_top_productos` | `p_desde date`, `p_hasta date`, `p_por text` (`kg`\|`monto`, default `kg`), `p_limite=20` | `ADMIN` \| `VENTAS` |
| `ai_top_clientes` | `p_desde date`, `p_hasta date`, `p_limite=20` | `ADMIN` \| `VENTAS` |
| `ai_cuentas_por_cobrar` | `p_cliente text`, `p_solo_vencidas boolean`, `p_limite=50` | `ADMIN` \| `VENTAS` |
| `ai_inventario_estado` | `p_producto text`, `p_almacen text`, `p_bajo_minimo boolean`, `p_limite=50` | `ADMIN` \| `OPERACIONES` \| permiso `almacenes.ver` |
| `ai_resumen_semana` | `p_fecha_ref date` | cualquier autenticado; cada bloque sujeto a su permiso |

Notas de semántica que el backend asume:

- **Defaults de rango:** `p_hasta` en null = hoy; `p_desde` en null = `p_hasta − 29`.
  Si el rango viene invertido, la función lo ordena sola.
- **Booleanos de tres estados:** `p_solo_vencidas` y `p_bajo_minimo` distinguen
  `true` / `false` / `null` (= sin filtro). Por eso en el esquema que ve el
  modelo van como `boolean | null` y no como un booleano simple.
- **`ai_buscar_venta` exige al menos un criterio**; sin ninguno levanta
  `sin_criterios` con `errcode = '22023'`.
- **`ai_top_productos` valida `p_por`**; cualquier valor fuera de `kg`/`monto`
  levanta `parametro_invalido` con `errcode = '22023'`.
- **Filtrar `ai_ventas_periodo` por producto** hace que kg e importe salgan solo
  de los renglones de ese producto, y `total_ordenes_periodo` viene en `null` a
  propósito.

## Errores

| `errcode` | Significado | Qué hace la API |
|---|---|---|
| `42501` | `no_autorizado`: el gate de la función rechazó al usuario | `tool_result` con `is_error: true` y una instrucción al modelo de decir que no hay permiso, sin estimar nada. SSE: `tool_end` con `ok: false` |
| `22023` | argumentos inválidos (`sin_criterios`, `parametro_invalido`) | `tool_result` con `is_error: true` y el mensaje de Postgres tal cual, para que el modelo corrija y reintente |
| cualquier otro | red, timeout, función inexistente | `tool_result` con `is_error: true` y un mensaje genérico; el detalle solo al log del servidor |

El mapeo vive en `apps/api/src/supabase/rpc.ts` y los mensajes en
`apps/api/src/tools/execute.ts`.

## Cómo se llaman

Siempre con la **anon key del sistema + el JWT del usuario** en el header
`Authorization` (`apps/api/src/supabase/client.ts`). Nunca con la service role
key. Un cliente de Supabase por petición, construido con la config del tenant
del header: no hay cliente global compartido.

Los parámetros en `null` se **omiten** del cuerpo del `rpc()` para que aplique el
default de la firma de Postgres. El esquema que ve el modelo los declara
nullable porque `strict: true` exige que toda propiedad esté en `required`; la
traducción de `null` a "clave ausente" pasa en `rpc.ts`.

## Pendiente conocido

`ai_cuentas_por_cobrar.resumen` no desglosa por `tipo_documento`, así que los
documentos `SALDO_INICIAL` (en ACM, la carga inicial del 12 de julio de 2026)
entran dentro de `cartera_total` y `vencido` sin poder separarse desde el
resumen. Hoy se separan desde `filas`, que trae `tipo_documento` fila por fila,
pidiendo `p_limite: 200` (lo instruye el prompt de ACM). Agregar un
`por_tipo_documento` al resumen lo volvería exacto siempre y es la solución
correcta; vive en el repo de ACM.
