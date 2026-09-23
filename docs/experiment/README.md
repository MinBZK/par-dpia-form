# Experiment: AI-hulp bij het AIIA

Deze branch (`experiment/aiia-ai`) is een afgeschermde speelomgeving. Hij vertakt
van `add_aiia` en rolt uit naar ZAD-project **`ai-3rt`**, los van het project
achter acceptatie en productie (`asses-k2n`): eigen database, eigen
Keycloak-realm, eigen budget.

## Chat-endpoint

`POST /api/v1/chat`, alleen aanwezig als `CHAT_ENABLED=true`. De backend zet het
gesprek door naar VLAM (de rijksbrede LLM-gateway, Mistral via UbiOps) en geeft
het antwoord terug.

```bash
curl -X POST https://<host>/api/v1/chat \
  -H "Authorization: Bearer <keycloak-token>" \
  -H "x-vlam-api-key: <je eigen VLAM-sleutel>" \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"Wat vraagt het AIIA bij 4.1.2?"}]}'
```

Antwoord: `{ "reply": "...", "model": "..." }`.

**De sleutel komt per verzoek mee in de header, niet uit de omgeving.** Er staat
dus geen LLM-sleutel op de deployment: niets te roteren, niets te lekken bij een
verkeerd gezette variabele, en geen gedeelde pot die leeggetrokken kan worden.
Iedereen brengt zijn eigen sleutel mee en betaalt zijn eigen gebruik. De server
bewaart de sleutel niet en logt hem niet; hij leeft precies één verzoek.

Foutcodes: `400` ontbrekende of misvormde sleutel, `503` omgeving zonder VLAM,
`502` VLAM gaf een fout, `504` VLAM antwoordde niet binnen `VLAM_TIMEOUT`.

## Instellen op ZAD

Op component `api` in `ai-3rt`, geen van beide geheim:

| Variabele | Waarde |
|---|---|
| `CHAT_ENABLED` | `true` |
| `VLAM_BASE_URL` | `https://api.demo.vlam.ai/v2.1/projects/<project>/openai-compatible/v1` |
| `VLAM_MODEL_ID` | het model uit dat VLAM-project |
| `VLAM_TIMEOUT` | optioneel, standaard 120 (seconden) |

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
draait lokaal gewoon; zonder `CHAT_ENABLED` bestaat de chat-route niet en merk
je er niets van.

```bash
pnpm install
./script/generate_sources.sh
CHAT_ENABLED=true VLAM_BASE_URL=... VLAM_MODEL_ID=... pnpm --filter boekhouding-backend dev
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
2. **Geen sleutel in de repository en geen sleutel in een omgevingsvariabele.**
   Een sleutel hoort in de header van het verzoek.
3. **Let op het verbruik.** VLAM antwoordt in ongeveer een seconde zonder tools,
   maar tientallen seconden zodra er tools in het spel zijn. Spreek het aantal
   testruns vooraf af.
