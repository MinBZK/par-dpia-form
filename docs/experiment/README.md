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
wordt niet aan de browser doorgegeven. De chat-routes vereisen een ingelogde
gebruiker of een chat-sleutel.

| Route | Functie |
|---|---|
| `GET /api/v1/chat/models` | beschikbare modellen: `{ "models": [...], "defaultModel": "..." \| null }` |
| `POST /api/v1/chat` | verstuurt een gesprek; antwoord: `{ "reply": "...", "model": "..." }` |
| `POST /api/v1/chat/keys` | maakt een chat-sleutel voor de commandline: `{ "key": "...", "expiresAt": "..." }`; `503` als chat-sleutels uit staan |

Body van `POST /api/v1/chat`:

```json
{
  "model": "<een id uit /models>",
  "messages": [
    { "role": "system", "content": "Je helpt bij het invullen van het AIIA." },
    { "role": "user", "content": "Wat wordt bedoeld met vraag 1.1.2?" }
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
die de vraag doorstuurt naar VLAM. Je hebt Node.js 22 of hoger nodig en eenmalig
`pnpm install`; de lokale stack hoeft niet te draaien.

### Snel aan de slag

1. Haal de repo op en ga naar de branch van het experiment. Alle commando's draai
   je in de hoofdmap van de repo:

   ```bash
   git clone https://github.com/MinBZK/par-dpia-form.git
   cd par-dpia-form
   git switch experiment/aiia-ai
   corepack enable   # activeert pnpm
   pnpm install
   ```

2. Maak een chat-sleutel (zie [Chat-sleutel](#chat-sleutel)).
3. Bekijk welke modellen er zijn; het script vraagt om de sleutel:

   ```bash
   pnpm experiment:chat modellen
   ```

4. Roep het model aan met een model uit die lijst:

   ```bash
   pnpm experiment:chat vraag "Wat is een AI impact assessment?" --model Kimi-K3-prepaid
   pnpm experiment:chat toets 1.1.1 --model Kimi-K3-prepaid --antwoord "Een chatbot die burgers helpt bij vergunningaanvragen."
   ```

Draai de commando's in een gewone terminal: het script vraagt de sleutel verborgen
op. Werk je later verder, haal dan eerst de laatste versie op met `git pull` en
draai `pnpm install` opnieuw.

| Commando | Functie |
|---|---|
| `pnpm experiment:chat modellen` | toont de beschikbare modellen en het standaardmodel |
| `pnpm experiment:chat vraag "Wat bedoelt vraag 1.1.2?"` | stelt één vraag |
| `pnpm experiment:chat gesprek` | voert een gesprek; een lege regel of `stop` beëindigt het |
| `pnpm experiment:chat toets 1.1.1` | laat het model een antwoord op AIIA-vraag 1.1.1 beoordelen |

Opties: `--model <id>` en `--systeem "<instructie>"` voor een eigen systeembericht.
Bij `toets` geef je het antwoord mee met `--antwoord "<tekst>"` of
`--bestand <pad>`; zonder die opties typ of plak je het en sluit je af met een
lege regel. Met `--help` verschijnt het overzicht. Het script bewaart niets.

Niet elk model uit `modellen` werkt met de sleutel van deze omgeving; geeft een
model `Fout 502`, kies dan een ander. Op 11 oktober 2026 werkten de
`prepaid`-modellen, zoals `Kimi-K3-prepaid`.

### Chat-sleutel

Het script vraagt om een chat-sleutel. Die maak je zelf:

1. Log in op de experimentomgeving en ga naar `/chat-sleutel`.
2. Klik op **Maak chat-sleutel** en daarna op **Kopieer sleutel**.
3. Plak de sleutel als het script erom vraagt. Hij verschijnt niet op het scherm en
   wordt nergens opgeslagen.

Een chat-sleutel werkt alleen voor de chat, niet voor je projecten of antwoorden,
en is 8 uur geldig. Geeft het script `Fout 401`, maak dan een nieuwe. Wie vaak
achter elkaar een commando draait, kan de sleutel voor die terminal in een
variabele zetten zonder dat hij in de geschiedenis komt:

```bash
read -rs AIIA_KEY && export AIIA_KEY   # plak de sleutel en druk op Enter
```

Deel de sleutel niet en zet hem niet in code, een bestand, een chat of een commit.

### Zelf verder bouwen

`toets` is een startpunt. De AIIA-kant staat in `scripts/experiment/aiia.mjs`:

| Functie | Wat het doet |
|---|---|
| `loadAiia()` | leest `sources/aiia.yaml` |
| `findTask(aiia, id)` | zoekt een vraag op, met de onderdelen erboven |
| `describeTask(found)` | zet vraag, toelichting, onderdeel en antwoordopties in een tekst |
| `buildReviewMessages(found, antwoord)` | bouwt het gesprek voor de beoordeling, met de instructie `REVIEW_SYSTEM` |

Wil je het model op een andere manier laten helpen, bijvoorbeeld een vraag laten
uitleggen, schrijf dan een eigen `build...Messages` naast `buildReviewMessages`
en geef die in `chat.mjs` een commando, naar het voorbeeld van `toets`. Pas je de
instructie aan, probeer die dan eerst met `--systeem` uit.

De tests van het script draaien zonder netwerk en zonder login met
`pnpm test:experiment`; ze gebruiken een nagebootste API en Keycloak.

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
| `CHAT_KEY_SECRET` | geheim van minstens 32 tekens: zet chat-sleutels aan (zie hieronder) |
| `CHAT_KEY_TTL_HOURS` | optioneel: geldigheid van een chat-sleutel in uren, standaard 8 |

`VLAM_API_URL` wordt door ZAD gezet via de dienst **VLAM-API** op `api`. De
Authorization Wall (SSO-poort) staat alleen op `frontend`. De `api` controleert
zelf het Keycloak-token; `/api/health` is publiek, zodat de uitrol kan worden
gecontroleerd.

### Chat-sleutels aanzetten

Zet op component `api` de geheime variabele `CHAT_KEY_SECRET`: een willekeurige
reeks van minstens 32 tekens, bijvoorbeeld de uitvoer van `openssl rand -hex 32`.
Daarmee ondertekent de backend de chat-sleutels. Zonder geheim, of met een korter
geheim, staan chat-sleutels uit en geeft `/chat-sleutel` een melding.

Vervang je het geheim, dan worden alle uitgegeven sleutels direct ongeldig. Doe
dat als een sleutel is uitgelekt of als het experiment stopt. De geldigheid stel je
in met `CHAT_KEY_TTL_HOURS` (standaard 8, maximaal 24).
