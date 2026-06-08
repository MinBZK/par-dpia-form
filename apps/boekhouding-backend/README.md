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
| **`WEB_CONCURRENCY`** | aantal CPU-cores | Aantal worker-processen (clustering). `1` = uit. Geclampt op `[1, 64]` |
| **`DB_POOL_MAX`** | `10` | Postgres-poolgrootte **per worker**. Geclampt op `[1, 100]` |
| **`DB_CONNECT_TIMEOUT`** | `10` | Seconden voordat een nieuwe DB-verbinding faalt |
| **`DB_IDLE_TIMEOUT`** | `30` | Seconden voordat een idle DB-verbinding wordt gesloten |
| **`RATE_LIMIT_MAX`** | `300` | Verzoeken per IP per minuut (cluster-breed; zie onder) |

Ongeldige/ontbrekende waarden vallen veilig terug op de default.

## Schalen (clustering)

De server draait standaard één worker per CPU-core (`node:cluster`), zodat de
beschikbare CPU wordt benut. Migraties draaien éénmalig vóór de workers starten
(container-CMD: `migrate && index`).

**Pool-rekensom — belangrijk:** elke worker heeft zijn eigen pool. Zorg dat

```
WEB_CONCURRENCY × DB_POOL_MAX  ≤  Postgres max_connections (default 100)  − headroom
```

(headroom voor migraties, Keycloak en beheer). Voorbeeld: 4 workers × 10 = 40 → ruim
binnen 100. Een te hoge combinatie kan de database uitputten (self-DoS).

De in-memory rate-limit is per worker; het entrypoint deelt `RATE_LIMIT_MAX` daarom
door het aantal workers, zodat de cluster-brede limiet bij benadering gelijk blijft.
