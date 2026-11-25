# 0013: Vragenoverzichten niet in de repository

Datum: 2026-11-23

## Status

Voorgesteld

## Besluit

De gegenereerde vragenoverzichten in `docs/questions/` (`questions_prescan.md`, `questions_DPIA.md` en `questions_IAMA.md`) staan niet langer in de repository. De map staat in `.gitignore`. Wie een overzicht nodig heeft, genereert het uit de bron met `script/run_all.py --output-md`.

## Achtergrond

De vragen van de invulhulpen staan in `sources/*.yaml`. `script/run_all.py` valideert die bronnen en schrijft daaruit de JSON voor de frontend. Met de optie `--output-md` schrijft hetzelfde script een Markdown-overzicht van de vragen. Die overzichten waren vastgelegd in `docs/questions/`.

Een vastgelegd overzicht is een afgeleide van de bron. Het moet bij elke wijziging in `sources/` opnieuw worden gegenereerd en meegecommit. Gebeurt dat niet, dan loopt het overzicht achter zonder dat een controle dat meldt. Bij het samenvoegen van branches geeft het bestand conflicten die inhoudelijk niets betekenen: de oplossing is steeds opnieuw genereren.

## Overweging

- De overzichten worden niet als naslag gebruikt. Buiten het generatiecommando in de README verwijst geen documentatie ernaar, en er is geen proces dat erop leunt.
- Genereren kost één commando en enkele seconden.
- De bron (`sources/*.yaml`) en de gegenereerde JSON blijven de enige plaatsen waar de vragen staan. De JSON staat om dezelfde reden al niet in de repository (`sources/generated/`).
- Minder gegenereerde bestanden in een wijziging maakt een review van de bron beter leesbaar.

## Details

- De drie bestanden in `docs/questions/` zijn verwijderd.
- `docs/questions/` staat in `.gitignore`, zodat een lokaal gegenereerd overzicht niet per ongeluk wordt meegecommit.
- `script/generate_sources.sh` schrijft alleen nog de JSON.
- De optie `--output-md` van `script/run_all.py` blijft bestaan. Voorbeeld:

  ```bash
  uv run --frozen python script/run_all.py \
    --schema schemas/assessment-definition.v2.schema.json \
    --source sources/dpia.yaml \
    --begrippen-yaml sources/begrippenkader_dpia.yaml \
    --output-json sources/generated/DPIA.json \
    --output-md docs/questions/questions_DPIA.md
  ```

- De workflows `build-standalone.yaml` en `release.yaml` geven `--output-md` nog mee. Het overzicht komt daar alleen in de werkmap van de runner terecht en wordt nergens gebruikt. De optie kan daar in een latere wijziging weg.
- `docs/tasks/` valt buiten dit besluit. Naar die bestanden verwijst `docs/rapport/rapport_v0.1.1.md`.

## Impact

- **Gebruikers:** geen. De invulhulpen gebruiken de JSON, niet de overzichten.
- **Ontwikkelteam:** een wijziging in `sources/` vraagt geen bijgewerkt overzicht meer. Wie de vragen als lopende tekst wil lezen, genereert het overzicht lokaal.
- **Andere branches:** `add_aiia` bevat `docs/questions/questions_AIIA.md` en een onboardinghandleiding die ernaar verwijst. Bij het samenvoegen met `main` vervalt dat bestand en wordt de handleiding aangepast.

## Alternatieven

- **Vastleggen en in CI controleren dat het overzicht actueel is.** Voorkomt achterlopen, maar houdt de afgeleide in elke wijziging en in elk merge-conflict. Niet gekozen, omdat de overzichten niet worden gebruikt.
- **Het overzicht bij een release als bijlage publiceren.** Kan later alsnog, als er vraag naar ontstaat. De release-workflow genereert het overzicht al.
