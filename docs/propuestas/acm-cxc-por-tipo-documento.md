# Propuesta para el repo de ACM: desglosar CxC por `tipo_documento`

> **NO aplicada.** Esto vive en `~/proyectos/acm`, no en este repo. Se deja aquí
> porque el hueco lo descubrió la Fase 2 y el workaround actual está en el system
> prompt de ACM (`apps/api/src/systems/acm.ts`).

## El problema

`ai_cuentas_por_cobrar` devuelve en `resumen` un solo número de `cartera_total`,
`vencido` y antigüedad. Los documentos `tipo_documento = 'SALDO_INICIAL'` —la
carga inicial del 12 de julio de 2026, alrededor de $4.8M— **están dentro de esos
totales** y no hay forma de separarlos desde el resumen.

`tipo_documento` sí viene fila por fila en `filas`, pero `filas` está acotado por
`p_limite` (máximo 200) sobre ~249 CxC abiertas. Hoy el asistente los separa
pidiendo `p_limite: 200` y sumando las filas a mano, y tiene instrucción de
declarar el desglose como parcial si `omitidas.por_limite > 0`.

Eso funciona, pero el número exacto debería salir del resumen.

## El cambio

Agregar una llave `por_tipo_documento` al `resumen` de
`ai_cuentas_por_cobrar(text, boolean, integer)`. Es aditivo: nada de lo que ya
devuelve cambia de nombre ni de forma, así que no rompe al backend actual.

En una migración nueva, repetir el `create or replace function` tal como está hoy
(migración `20261006120000_ai_rpcs_v1.sql`, sección 7) e insertar este fragmento
dentro del `jsonb_build_object` de `'resumen'`, por ejemplo justo después de
`'vencimiento_estimado', agg.n_estimadas,`:

```sql
      'por_tipo_documento',    coalesce((
                                 select jsonb_object_agg(t.tipo, jsonb_build_object(
                                          'documentos', t.n,
                                          'saldo',      round(t.saldo, 2),
                                          'vencido',    round(t.vencido, 2),
                                          'sin_vencimiento_real', t.estimadas
                                        ))
                                 from (
                                   select coalesce(f.tipo_documento, 'SIN_TIPO')       as tipo,
                                          count(*)                                     as n,
                                          coalesce(sum(f.saldo_pendiente), 0)          as saldo,
                                          coalesce(sum(f.saldo_pendiente) filter (
                                            where f.dias_vencido > 0), 0)              as vencido,
                                          count(*) filter (
                                            where f.vencimiento_estimado)              as estimadas
                                   from filtrado f
                                   group by coalesce(f.tipo_documento, 'SIN_TIPO')
                                 ) t
                               ), '{}'::jsonb),
```

Se apoya en el CTE `filtrado` que la función ya tiene, así que respeta
`p_cliente` y `p_solo_vencidas`, y en `vencimiento_estimado`, que ya marca los
documentos cuyo vencimiento se calculó con `fecha_emision + dias_credito` en
lugar de leerlo de `fecha_vencimiento`.

Conviene también extender la `nota` del resumen para decir que
`por_tipo_documento` desglosa la cartera y que `SALDO_INICIAL` es la carga
inicial del sistema.

## Después de aplicarla

En este repo, en `apps/api/src/systems/acm.ts`, la nota de cartera se simplifica:
en lugar de instruir `p_limite: 200` y sumar a mano, basta con decirle al modelo
que use `resumen.por_tipo_documento` y que separe `SALDO_INICIAL` de ahí. El
tope de filas deja de importar para esa pregunta.

Nada más del backend cambia: la llave es aditiva y las tools pasan el resultado
completo al modelo.
