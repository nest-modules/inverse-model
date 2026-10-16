# Cache

Los resultados de las consultas se pueden guardar en cache en Redis. Instala `ioredis` y dale una URL a la cache:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  cache: {
    url: process.env.REDIS_URL!,
    ttl: 60, // segundos
    ttlByTable: { audit_logs: 0, countries: 3600 },
  },
});
```

| Opción | Por defecto | Qué hace |
|---|---|---|
| `cache.url` | (sin cache) | Cadena de conexión de Redis. |
| `cache.ttl` | `60` | Segundos que se conserva un resultado. |
| `cache.ttlByTable` | `{}` | TTL por nombre de tabla o colección; `0` deja una tabla sin cache. |
| `cache.keyPrefix` | `inverse:` | Prefijo de cada clave que escribe la cache. |

## Qué se guarda en cache

Listas, conteos, búsquedas por clave, connections y batches de relaciones. Cada resultado se identifica por su tabla, sus argumentos y, cuando [`scope`](./security#scope) está definido, el scope, así que los tenants nunca comparten resultados.

## Invalidación

Una mutation borra los resultados en cache de la tabla en la que escribió, sin tocar otras tablas. Dentro de una [transacción](./extending#transacciones), las tablas se borran cuando termina, nunca antes del commit, así que ningún lector guarda en cache lo que había antes.

Cada tabla tiene un número de versión en Redis que forma parte de cada clave, y una escritura lo incrementa. Los resultados viejos nunca se vuelven a leer y expiran solos, así que la invalidación es un solo comando de Redis sin importar cuántos resultados tenga una tabla.

Una consulta que filtra por una relación también se borra con las escrituras en la tabla relacionada.

## Cuando Redis no está disponible

Las lecturas van a la base de datos y se registra una advertencia en el log. La API sigue funcionando, solo que sin la cache.

## Escrituras desde fuera de la API

La cache solo conoce las escrituras hechas a través de la API. Si otros sistemas escriben en las mismas tablas, usa un `ttl` corto para esas tablas, o `0` para dejarlas sin cache.
