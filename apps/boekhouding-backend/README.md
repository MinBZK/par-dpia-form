# Invulhulpen backend

Fastify + Drizzle (Postgres) API voor de collaboratie-features (projecten, assessments,
comments, sync). Authenticatie via Keycloak (OIDC, JWT-bearer).

## Ontwikkelen

```bash
pnpm --filter boekhouding-backend dev            # tsx watch
pnpm --filter boekhouding-backend test           # vitest (vereist Postgres, zie onder)
pnpm --filter boekhouding-backend test:coverage  # 100%-gate
npx tsc --noEmit                                 # type-check (vanuit deze map)
```

Tests draaien tegen een echte Postgres. Zet `TEST_DATABASE_URL`, of laat de default
(`postgresql://parassessment:parassessment@localhost:5432/parassessment_test`) staan.

## Omgevingsvariabelen

| Variabele | Default | Beschrijving |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Luisteradres |
| `DATABASE_SERVER_FULL` | localhost-dev-URL | Postgres-connectiestring (bevat wachtwoord — niet loggen) |
| `OIDC_URL` / `OIDC_INTERNAL_URL` | `http://localhost:8080` | Publieke resp. in-cluster Keycloak-URL (JWKS gebruikt de interne) |
| `OIDC_REALM` | `invulhulpen` | Keycloak-realm |
| `OIDC_PUBLIC_CLIENT_ID` | `boekhouding-frontend` | Verwachte `azp`-claim |
| `CORS_ORIGIN` / `PUBLIC_HOST` | `http://localhost:5174` | Toegestane origin(s), comma-gescheiden lijst mogelijk |
| `TRUST_PROXY` | `1` | Aantal proxy-hops (voor `req.ip` / rate-limit) |
| `EXPOSE_API_DOCS` | `false` | Swagger UI + `/api/openapi.json` |
| **`WEB_CONCURRENCY`** | `1` | Aantal worker-processen (clustering). Standaard 1 (uit); opt-in via `> 1`. Geclampt op `[1, 64]` |
| **`DB_POOL_MAX`** | `9` | Postgres-poolgrootte **per worker**. Geclampt op `[1, 20]` (de per-user cap) |
| **`DB_CONNECT_TIMEOUT`** | `10` | Seconden voordat een nieuwe DB-verbinding faalt |
| **`DB_IDLE_TIMEOUT`** | `30` | Seconden voordat een idle DB-verbinding wordt gesloten |
| **`RATE_LIMIT_MAX`** | `300` | Verzoeken per IP per minuut (cluster-breed; zie onder) |

Ongeldige/ontbrekende waarden vallen veilig terug op de default.

## Schalen en de connectie-limiet

De gedeelde RIG-Postgres (`rig-db`) staat op `max_connections: 250` met
`reserved_connections: 10`, en — bindend voor ons — **elke project-DB-user is
gecapt op 20 connecties** (`CONNECTION LIMIT 20`, ingesteld na een incident waarbij
één project alle slots opslokte en Keycloak brak). Dat aantal van **20 is dus het
totale budget over álle pods, replica's en workers samen**.

Omdat de app I/O-bound is (lage CPU-load) en DB-werk op de DB-server draait, levert
**één worker met een gezonde pool** de beste balans — niet veel workers met mini-pools.
Let op: een **rolling deploy** draait kort twee pods naast elkaar (de oude + de
surge-pod), die allebei onder dezelfde DB-user connecties houden. Het budget is dus:

```
pods × WEB_CONCURRENCY × DB_POOL_MAX  ≤  20
```

Standaard: 1 replica + 1 surge = **2 pods** × 1 worker × `DB_POOL_MAX=9` = **18**, een
krappe marge onder 20. (Bij `Recreate`-strategie of `maxSurge=0` is er geen overlap en
mag de pool hoger; bij méér replica's of clustering navenant lager.) Wil je echt naar
veel gelijktijdige gebruikers schalen, dan is een **connection pooler (PgBouncer)** de
juiste route (al voorzien als rig-cluster-*future*) i.p.v. een grotere per-worker-pool.

De in-memory rate-limit is per worker; het entrypoint deelt `RATE_LIMIT_MAX` daarom
door het aantal workers, zodat de cluster-brede limiet bij benadering gelijk blijft.
