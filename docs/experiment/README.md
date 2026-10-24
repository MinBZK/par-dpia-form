# Experiment: AI-ondersteuning bij het AIIA

Deze branch (`experiment/aiia-ai`) is bedoeld voor onderzoek naar de inzet van een
taalmodel bij het invullen van het AIIA. De experimentomgeving is ingericht en de
koppeling met VLAM, de rijksbrede taalmodel-API, is getest.

## Omgeving

| | |
|---|---|
| Adres | `https://experiment-ai-3rt.rig.prd1.gn2.quattro.rijksapps.nl` |
| Toegang | via SSO; accounts worden aangevraagd bij de begeleider |
| Pull request | [#568](https://github.com/MinBZK/par-dpia-form/pull/568) |
| ZAD-project | `ai-3rt`, deployment `experiment` |

Het adres staat als code vermeld, omdat de linkcheck in CI achter de SSO-poort een
`403` krijgt.

De omgeving is gescheiden van acceptatie en productie, met een eigen database, een
eigen Keycloak-realm en een eigen VLAM-budget. Wijzigingen in deze omgeving hebben
geen gevolgen voor gebruikers van de reguliere omgevingen.

## Werkwijze

1. Maak een branch vanaf `experiment/aiia-ai`.
2. Open een pull request naar `experiment/aiia-ai`. Pull requests naar `main` vallen
   buiten dit experiment.
3. Na een merge rolt GitHub Actions de nieuwe versie uit. Dit duurt 5 tot 10
   minuten. Het actuele adres en de uitgerolde commit staan als comment in #568.

Alleen `experiment/aiia-ai` wordt uitgerold; feature-branches krijgen geen eigen
omgeving. Test daarom lokaal (zie hieronder) en stem onderling af wie wanneer
merget.

## Chat-API

De backend stuurt een gesprek door naar VLAM. De VLAM-sleutel staat op de server en
wordt niet aan de browser doorgegeven. Beide routes vereisen een ingelogde
gebruiker.

| Route | Functie |
|---|---|
| `GET /api/v1/chat/models` | beschikbare modellen: `{ "models": [...], "defaultModel": "..." \| null }` |
| `POST /api/v1/chat` | verstuurt een gesprek; antwoord: `{ "reply": "...", "model": "..." }` |

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

`model` is optioneel als voor de omgeving een standaardmodel is ingesteld. De server
bewaart geen gesprekken: de client stuurt bij elke beurt de volledige geschiedenis
mee, met een maximum van 50 berichten van elk 8000 tekens.

Aanroepen vanuit de frontend verlopen via de bestaande helper in
`apps/boekhouding-frontend/src/api.ts`, die het inlogtoken meestuurt:

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

Foutcodes: `400` ongeldig verzoek of geen model opgegeven, `401` niet ingelogd,
`502` fout van VLAM, `503` VLAM niet geconfigureerd voor deze omgeving, `504` geen
antwoord van VLAM binnen de time-out.

## Bestanden

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

VLAM is alleen bereikbaar vanuit de ZAD-omgeving. Lokaal geeft de chat-route
daarom `503`; de overige functionaliteit werkt normaal. Voor lokale ontwikkeling
kan `chat.send` in de frontend worden gemockt. Echte aanroepen naar het model doe
je vanaf je eigen machine via de experimentomgeving (zie hieronder).

## Het model aanroepen vanaf je eigen machine

Met `scripts/experiment/chat.mjs` stuur je vanaf je laptop een vraag naar het echte
model. Het script draait lokaal en roept de chat-API van de experimentomgeving aan,
die de vraag doorstuurt naar VLAM. Het heeft alleen Node.js 22 of hoger nodig; de
lokale stack hoeft niet te draaien.

| Commando | Functie |
|---|---|
| `pnpm experiment:chat modellen` | toont de beschikbare modellen en het standaardmodel |
| `pnpm experiment:chat vraag "Wat bedoelt vraag 4.1.2?"` | stelt één vraag |
| `pnpm experiment:chat gesprek` | voert een gesprek; een lege regel of `stop` beëindigt het |

Opties: `--model <id>` en `--systeem "<instructie>"` voor een eigen systeembericht.
Met `--help` verschijnt het overzicht. Het script bewaart niets: bij elke beurt in
een gesprek gaat de volledige geschiedenis mee, tot het maximum van 50 berichten.

### Token ophalen

De chat-API vraagt om je inlogtoken. Iedereen die kan inloggen op de
experimentomgeving heeft er een; gebruik altijd je eigen token. Je haalt het uit de
browser:

1. Log in op de experimentomgeving en open een project.
2. Open de ontwikkelaarstools (F12), tabblad **Network**, en klik in de lijst op
   een verzoek naar `/api/v1/...`.
3. Kopieer bij **Request Headers** de waarde van `Authorization`.

Start het script en plak het token als erom wordt gevraagd; het verschijnt niet op
het scherm. Voor meerdere aanroepen achter elkaar kan het token ook in een
variabele:

```bash
export AIIA_TOKEN='Bearer eyJ...'
pnpm experiment:chat modellen
pnpm experiment:chat vraag "Wat bedoelt vraag 4.1.2?" --model <id>
```

Het token verloopt na enkele minuten. Geeft het script `Fout 401`, haal dan een
nieuw token op. Niet elk model uit `modellen` werkt met de sleutel van deze
omgeving; geeft een model `Fout 502`, kies dan een ander. Op 11 oktober 2026
werkten de `prepaid`-modellen, zoals `Kimi-K3-prepaid`.

Elke vraag gaat naar het echte model en gaat ten koste van het budget van de
omgeving. De afspraken hieronder gelden dus ook voor het script: beperk het
verbruik en gebruik geen echte persoonsgegevens. Het token geeft toegang tot je
account; deel het niet en zet het niet in code of commits.

De tests van het script draaien zonder netwerk en zonder token met
`pnpm test:experiment`.

## Afspraken

1. **Deze branch wordt niet naar `main` gemerged.** Resultaten die naar productie
   gaan, volgen een apart traject.
2. **Geen sleutels in code of commits.** De VLAM-sleutel staat uitsluitend in ZAD.
3. **Beperk het verbruik.** Elk verzoek gaat ten koste van het budget. Test gericht
   en vermijd onnodig lange gesprekken of grote hoeveelheden tekst.
4. **Geen echte persoonsgegevens** in prompts of testdata. Alle invoer van de chat
   wordt naar VLAM verzonden.

## Beheer

Instellingen op component `api` in ZAD-project `ai-3rt`:

| Variabele | Waarde |
|---|---|
| `VLAM_API_KEY` | de VLAM-sleutel, als geheim (verstrekt door SSC-ICT) |
| `VLAM_MODEL_ID` | optioneel: standaardmodel als de client geen model meegeeft |
| `VLAM_BASE_URL` | alleen buiten ZAD; op ZAD gebruikt de backend `{VLAM_API_URL}/v1` |
| `VLAM_TIMEOUT` | optioneel, standaard 120 seconden |

`VLAM_API_URL` wordt door ZAD gezet via de dienst **VLAM-API** op `api`. De
Authorization Wall (SSO-poort) staat alleen op `frontend`. De `api` controleert
zelf het Keycloak-token; `/api/health` is publiek, zodat de uitrol kan worden
gecontroleerd.
