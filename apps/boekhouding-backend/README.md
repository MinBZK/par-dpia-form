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
| **`DB_POOL_MAX`** | `9` | Postgres-poolgrootte **per pod**. Geclampt op `[1, 20]` (de per-user cap) |
| **`DB_CONNECT_TIMEOUT`** | `10` | Seconden voordat een nieuwe DB-verbinding faalt |
| **`DB_IDLE_TIMEOUT`** | `30` | Seconden voordat een idle DB-verbinding wordt gesloten |
| **`DB_STATEMENT_TIMEOUT`** | `15` | Max queryduur (seconden) voordat Postgres afbreekt |
| **`DB_IDLE_IN_TX_TIMEOUT`** | `15` | Max idle-in-transaction (seconden) voordat de sessie wordt afgebroken |
| **`RATE_LIMIT_MAX`** | `300` | Verzoeken per IP per minuut, per pod |
| **`SHUTDOWN_DELAY`** | `5` | Seconden wachten na SIGTERM voordat de server sluit (zie onder) |

Ongeldige/ontbrekende waarden vallen veilig terug op de default.

## Schalen en de connectie-limiet

De gedeelde RIG-Postgres (`rig-db`) staat op `max_connections: 250` met
`reserved_connections: 10`, en — bindend voor ons — **elke project-DB-user is
gecapt op 20 connecties** (`CONNECTION LIMIT 20`, ingesteld na een incident waarbij
één project alle slots opslokte en Keycloak brak). Dat aantal van **20 is dus het
totale budget over álle pods en replica's samen**.

Let op: een **rolling deploy** draait kort twee pods naast elkaar (de oude + de
surge-pod), die allebei onder dezelfde DB-user connecties houden. Het budget is dus:

```
pods × DB_POOL_MAX  ≤  20
```

Standaard: 1 replica + 1 surge = **2 pods** × `DB_POOL_MAX=9` = **18**, een krappe
marge onder 20. (Bij `Recreate`-strategie of `maxSurge=0` is er geen overlap en mag de
pool hoger; bij méér replica's navenant lager.) Het aantal pods staat in de ZAD
Operations Manager, buiten deze repo — deze rekensom is dus handwerk bij elke
schaalwijziging. Wil je echt naar veel gelijktijdige gebruikers schalen, dan is een
**connection pooler (PgBouncer)** de juiste route (al voorzien als rig-cluster-*future*)
i.p.v. een grotere pool per pod.

De in-memory rate-limit is per pod: bij meerdere replica's is de effectieve limiet een
veelvoud van `RATE_LIMIT_MAX`.

## Graceful shutdown in Kubernetes

De kubelet stuurt SIGTERM op hetzelfde moment dat de endpoint-controller de pod uit de
service haalt, en die twee planten zich onafhankelijk voort. Direct sluiten zou dus
requests weigeren die de ingress nog hierheen stuurt (502's bij elke deploy). De
volgorde is daarom: `/api/health` gaat meteen op **503** → `SHUTDOWN_DELAY` seconden
wachten → lopende requests afronden (`app.close()`) → DB-pool vrijgeven. Dat geheel moet
binnen `terminationGracePeriodSeconds` passen (default 30s). De Containerfile gebruikt
`exec node`, zodat node PID 1 is en SIGTERM ook echt ontvangt.
