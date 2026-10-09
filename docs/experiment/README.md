# Experiment: AI-hulp bij het AIIA

Op deze branch (`experiment/aiia-ai`) onderzoeken we hoe een taalmodel kan helpen
bij het invullen van het AIIA. De omgeving staat klaar: de app draait, de koppeling
met VLAM (de rijksbrede taalmodel-API) werkt, en je kunt meteen beginnen.

## De omgeving

| | |
|---|---|
| Adres | https://experiment-ai-3rt.rig.prd1.gn2.quattro.rijksapps.nl |
| Inloggen | via SSO; heb je geen toegang, vraag dan je begeleider om een account |
| Pull request | [#568](https://github.com/MinBZK/par-dpia-form/pull/568) |
| ZAD-project | `ai-3rt`, deployment `experiment` |

De omgeving staat los van acceptatie en productie: eigen database, eigen inlog,
eigen VLAM-budget. Je kunt er niets kapotmaken wat echte gebruikers merken.

## Zo werk je

1. Maak een branch vanaf `experiment/aiia-ai`.
2. Open een pull request **naar `experiment/aiia-ai`** (niet naar `main`).
3. Na merge rolt GitHub Actions de nieuwe versie automatisch uit. Dat duurt
   5 tot 10 minuten; de actuele URL en commit staan als comment in #568.

Alleen `experiment/aiia-ai` wordt uitgerold. Je eigen branch krijgt geen eigen
omgeving, dus test lokaal (zie onder) of overleg wie wanneer merget.

## De chat-API

De backend zet een gesprek door naar VLAM. De VLAM-sleutel staat op de server; de
browser krijgt hem nooit te zien. Beide routes vragen een ingelogde gebruiker.

| Route | Wat |
|---|---|
| `GET /api/v1/chat/models` | beschikbare modellen: `{ "models": [...], "defaultModel": "..." \| null }` |
| `POST /api/v1/chat` | stuurt een gesprek, antwoord: `{ "reply": "...", "model": "..." }` |

Body van `POST /api/v1/chat`:

```json
{
  "model": "<een id uit /models>",
  "messages": [
    { "role": "system", "content": "Je helpt bij het invullen van het AIIA." },
    { "role": "user", "content": "Wat wordt bedoeld met vraag 4.1.2?" }
  ]
}
```

`model` mag weg als de omgeving een standaardmodel heeft. Het gesprek wordt niet
bewaard: stuur bij elke beurt de hele geschiedenis mee (maximaal 50 berichten van
8000 tekens).

Aanroepen vanuit de frontend gaat via de bestaande helper in
`apps/boekhouding-frontend/src/api.ts`, die het inlogtoken al meestuurt:

```ts
export const chat = {
  models: () =>
    request<{ models: string[]; defaultModel: string | null }>('/api/v1/chat/models'),
  send: (messages: { role: 'system' | 'user' | 'assistant'; content: string }[], model?: string) =>
    request<{ reply: string; model: string }>('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, ...(model && { model }) }),
    }),
}
```

Foutcodes: `400` ongeldig verzoek of geen model, `401` niet ingelogd, `502` VLAM gaf
een fout, `503` VLAM niet ingesteld op deze omgeving, `504` VLAM antwoordde niet op
tijd.

## Waar zit wat

| | |
|---|---|
| Chat-route (backend) | `apps/boekhouding-backend/src/routes/chat.ts` |
| Frontend | `apps/boekhouding-frontend/` (Vue 3) en `packages/assessment-core/` (formulier) |
| AIIA-vragen | `sources/aiia.yaml` |
| Projectconventies | `.claude/CLAUDE.md` |

## Lokaal draaien

```bash
corepack enable
pnpm install
podman compose -f containers/compose.dev.yaml up -d   # backend, frontend, database, Keycloak
pnpm db:seed                                          # testdata
```

VLAM is alleen bereikbaar vanuit de ZAD-omgeving. Lokaal geeft de chat-route dus
`503`; de rest van de app werkt gewoon. Wil je lokaal tegen een nep-antwoord
ontwikkelen, mock dan `chat.send` in de frontend.

Tests draaien met `pnpm -r test:coverage`. De coverage-drempel is 100 procent, dus
nieuwe code heeft tests nodig. De backend-tests hebben een Postgres nodig (zie
`.claude/CLAUDE.md`).

## Afspraken

1. **Deze branch gaat niet naar `main`.** Wat we hier leren, komt later via een
   aparte, bewuste stap naar productie.
2. **Geen sleutels in de code of in commits.** De VLAM-sleutel staat alleen in ZAD.
3. **Let op het verbruik.** Elk verzoek kost budget. Een antwoord duurt een paar
   seconden; met lange gesprekken of veel tekst loopt dat op. Test gericht.
4. **Geen echte persoonsgegevens** in prompts of testdata. Alles wat je naar de chat
   stuurt, gaat naar VLAM.

## Voor beheer

Instellingen op component `api` in ZAD-project `ai-3rt`:

| Variabele | Waarde |
|---|---|
| `VLAM_API_KEY` | de VLAM-sleutel, als geheim (van SSC-ICT, niet via ZAD) |
| `VLAM_MODEL_ID` | optioneel: standaardmodel als de client er geen meegeeft |
| `VLAM_BASE_URL` | alleen buiten ZAD; op ZAD gebruikt de backend `{VLAM_API_URL}/v1` |
| `VLAM_TIMEOUT` | optioneel, standaard 120 seconden |

`VLAM_API_URL` zet ZAD zelf via de dienst **VLAM-API** op `api`. De Authorization
Wall (SSO-poort) staat alleen op `frontend`; `api` controleert zelf het
Keycloak-token, en `/api/health` is publiek zodat de uitrol gecontroleerd kan worden.
