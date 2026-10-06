# Contrato de RPCs `ai_*`

> **Estado: pendiente (Fase 1).** Este archivo es el placeholder del contrato.
> Hasta cerrarlo no se escribe ninguna tool en `apps/api/src/tools/`.

El backend del asistente nunca consulta tablas: solo llama funciones RPC con
nombre, parámetros y forma de respuesta **idénticos en los 8 sistemas**. Lo que
cambia entre ERPs es el SQL interno de cada función, no su firma.

## Reglas que toda RPC `ai_*` debe cumplir

1. `security invoker` — hereda `auth.uid()` del llamador, así RLS aplica.
   Nunca `security definer` para datos del cliente.
2. Prefijo `ai_` y nombre en español, en singular o plural según el caso
   (`ai_ventas_periodo`, `ai_buscar_venta`).
3. Parámetros nombrados y con default cuando aplique; fechas como `date` en la
   zona horaria del sistema.
4. Devuelve `json` con una forma fija y documentada aquí.
5. Límite de filas propio, y el conteo de las filas omitidas en la respuesta.
6. **Ninguna expone nómina, sueldos ni datos de empleados.**

## Pendiente de definir en la Fase 1

Para cada RPC del catálogo (`ai_ventas_periodo`, `ai_buscar_venta`,
`ai_top_clientes`, `ai_top_productos`, `ai_inventario_estado`,
`ai_cuentas_por_cobrar`): firma exacta, esquema de la respuesta, límite de filas,
política de RLS asociada y el SQL de referencia para ACM.
