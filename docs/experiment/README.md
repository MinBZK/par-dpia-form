# Experiment: AI-hulp bij het AIIA

Deze branch (`experiment/aiia-ai`) is een afgeschermde speelomgeving. Hij vertakt
van `add_aiia` en rolt uit naar ZAD-project **`ai-3rt`**, los van het project
achter acceptatie en productie (`asses-k2n`): eigen database, eigen
Keycloak-realm, eigen budget.

## Chat-endpoint

`POST /api/v1/chat`. De backend zet het gesprek door naar VLAM (de rijksbrede
LLM-gateway, Mistral via UbiOps) en geeft het antwoord terug.

```bash
curl -X POST https://<host>/api/v1/chat \
  -H "Authorization: Bearer <keycloak-token>" \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"Wat vraagt het AIIA bij 4.1.2?"}]}'
```

Antwoord: `{ "reply": "...", "model": "..." }`.

Het model kiest de client: geef `"model": "<id>"` mee in de body. Zonder model geldt
`VLAM_MODEL_ID`, als die is ingesteld. Welke modellen er zijn, geeft
`GET /api/v1/chat/models`: `{ "models": [...], "defaultModel": "..." | null }`. De
sleutel blijft op de server.

**De VLAM-sleutel staat als geheim op de deployment.** Wie de omgeving kan
bereiken, kan dus het VLAM-budget van dit project gebruiken. Daarom staat de
ZAD-SSO-poort voor `ai-3rt`, en vraagt de route daarnaast om de gewone login.
De server logt de sleutel niet en geeft hem in geen enkele foutmelding terug.

Foutcodes: `401` niet ingelogd, `503` omgeving zonder volledige
VLAM-instellingen, `502` VLAM gaf een fout, `504` VLAM antwoordde niet binnen
`VLAM_TIMEOUT`.

## Instellen op ZAD

Op component `api` in `ai-3rt`:

Zet de ZAD-service **VLAM-API** aan op `api`. Die geeft de pod `VLAM_API_URL`, het
adres van de VLAM-proxy in het cluster, en opent het netwerk ernaartoe. De backend
roept VLAM dan aan op `{VLAM_API_URL}/v1/chat/completions`.

| Variabele | Waarde |
|---|---|
| `VLAM_API_KEY` | de VLAM-sleutel, als geheim (krijg je bij SSC-ICT, niet via ZAD) |
| `VLAM_MODEL_ID` | optioneel: het model als de client er geen meegeeft |
| `VLAM_BASE_URL` | alleen buiten ZAD nodig, bijvoorbeeld lokaal; gaat voor `VLAM_API_URL` |
| `VLAM_TIMEOUT` | optioneel, standaard 120 (seconden) |

Ontbreekt het adres of de sleutel, dan antwoordt de route met `503`. Ontbreekt
alleen het model, dan `400`.

`VLAM_BASE_URL` heeft bewust geen standaardwaarde. Een standaard zou naar het
VLAM-project van een ander project wijzen, en een verkeerd ingestelde omgeving
zou dan stilletjes hun budget opmaken in plaats van te falen.

## Bereikbaarheid van VLAM

VLAM staat achter een IP-slot. Het adres bestaat nog en de server neemt de
verbinding aan, maar breekt de TLS-handshake af bij een client die er niet op
staat. Vanaf een willekeurige internetverbinding kom je er dus niet bij.

Dat is voor deze opzet geen belemmering, om twee redenen:

- De aanroep gebeurt **server-side**: de backend praat met VLAM, de browser
  niet. Alleen de `api`-pod heeft een route nodig, geen enkele student.
- De uitgaande verbindingen van het ZAD-cluster staan op de allowlist van VLAM.

Er is **geen clientcertificaat** nodig; de Bearer-sleutel in de header volstaat.

Nog niet nagegaan: of VLAM vanuit het cluster ook onder een intern adres te
bereiken is. Dat zou schelen in latency, maar is geen voorwaarde. Test de route
één keer vanuit een pod in `ai-3rt` voordat je erop gaat bouwen.

## Lokaal draaien

**Let op:** een backend die op je eigen machine draait, bereikt VLAM niet zonder
VPN — ook niet met een geldige sleutel. Je krijgt dan een `502`. Werk aan de
chat-kant dus op de ZAD-omgeving, of zet de VPN aan. De rest van de applicatie
draait lokaal gewoon; zonder VLAM-instellingen antwoordt alleen de chat-route
met `503`.

```bash
pnpm install
./script/generate_sources.sh
VLAM_BASE_URL=... VLAM_MODEL_ID=... VLAM_API_KEY=... pnpm --filter boekhouding-backend dev
```

Tests draaien tegen Postgres; de coverage-drempel staat op 100 procent, dus
nieuwe code heeft tests nodig:

```bash
pnpm -r test:coverage
```

## Afspraken

1. **Deze branch gaat niet naar `main`.** Alleen hier bestaat de koppeling met
   VLAM. Komt de functionaliteit later toch naar productie, dan is dat een
   aparte, bewuste stap met een eigen beoordeling.
2. **Geen sleutel in de repository.** De sleutel staat alleen als geheim op
   component `api` in ZAD, en `ai-3rt` blijft achter de SSO-poort.
3. **Let op het verbruik.** VLAM antwoordt in ongeveer een seconde zonder tools,
   maar tientallen seconden zodra er tools in het spel zijn. Spreek het aantal
   testruns vooraf af.
