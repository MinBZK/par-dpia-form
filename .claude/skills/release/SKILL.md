---
name: Release
description: Use when asked to cut, prepare, or ship a release of the invulhulpen app, to deploy to production, or to tag a CalVer version. Covers the changelog → tag → automated release/deploy flow and its guards.
version: 0.1.0
---

# Een release uitbrengen

De app gebruikt **Calendar Versioning**: `vYYYY.M.D`, maand en dag **zonder
voorloopnul** (bijv. `v2026.6.14`). Meerdere releases op één dag krijgen een
micro-suffix: `v2026.6.14.1`. Productie wordt uitsluitend via zo'n tag
bijgewerkt; `main` werkt alleen acceptatie bij.

## Stappen

1. **Changelog afronden.** Verplaats in `CHANGELOG.md` de inhoud van
   `## [Unreleased]` naar een nieuwe sectie met de versie en datum:

   ```markdown
   ## [2026.6.14]
   ```

   (versie zonder de `v`-prefix en zonder voorloopnullen, en zonder datum: de
   versie ís de datum). Laat een lege
   `## [Unreleased]` achter.

   **Zet in dezelfde PR de assessments-plugin op dezelfde versie.** De plugin
   wordt rechtstreeks uit de working tree geladen, dus het nummer moet
   gecommit zijn vóór de tag:

   ```bash
   python3 .claude/plugins/assessments/scripts/generate_plugin.py --set-version 2026.6.14
   ```

   Dat schrijft `.plugin/plugin.json` en genereert de Claude Code- en
   Cursor-manifests.

   **Zet in dezelfde PR `publiccode.yml` op dezelfde versie.** Dat bestand is de
   metadata waarop open-sourcecatalogi de laatste versie tonen:

   ```bash
   bash script/ci/set-publiccode-version.sh v2026.6.14
   ```

   Dat zet `softwareVersion` en `releaseDate` (onder CalVer volgt de datum uit
   de tag; een micro-suffix houdt dezelfde datum). Breng het geheel via een PR
   naar `main`.

2. **Zorg dat acceptatie groen is.** De tag promoot het image dat voor de
   main-commit is gebouwd; de `Deploy acceptatie`-run voor die commit moet
   geslaagd zijn (anders bestaat het te promoten image niet). `tag-release`
   controleert dit ook zelf.

3. **Release uitbrengen** via `tag-release`. Zet de tag niet met de hand: die
   workflow draait eerst álle guards en zet de tag pas als ze slagen, zodat een
   misser geen tag achterlaat om op te ruimen.

   ```bash
   gh workflow run tag-release.yaml -f version=2026.6.14
   gh run watch "$(gh run list --workflow=tag-release.yaml --limit 1 --json databaseId --jq '.[0].databaseId')"
   ```

   Faalt de run, dan bestaat de tag niet: los op wat de melding aanwijst, breng
   dat naar `main` en start `tag-release` opnieuw. Geen tag verwijderen, geen
   hertaggen.

## Wat er daarna automatisch gebeurt

- **`tag-release.yaml`** valideert het tagformaat, dat de tag nog niet bestaat,
  dat het geen downgrade is, dat de changelog-sectie er staat, dat de plugin en
  `publiccode.yml` op dezelfde versie staan en dat de acceptatie-images bestaan. Pas daarna pusht
  het de tag en start het `release.yaml` (een tag-push door `GITHUB_TOKEN` start
  `release.yaml` niet vanzelf).
- **`release.yaml`** valideert het CalVer-formaat en de changelog-sectie, maakt
  de GitHub-release met die sectie als notes, en **start daarna pas**
  `deploy-productie`. In een aparte job bouwt het het standalone formulier en
  hangt de offline single-file als release-asset aan (een hapering daarin
  blokkeert de release of productie-deploy niet).
- **`deploy-productie.yaml`** (gestart door `release.yaml`, of handmatig via
  Run workflow) valideert formaat + changelog, blokkeert een downgrade (de tag
  moet de nieuwste CalVer zijn), controleert dat de tag op `main` staat, en
  promoot de acceptatie-images (geen rebuild) naar de CalVer-tag →
  ZAD-deployment `productie`. Mislukt de release-aanmaak, dan start dit niet.

## Guards (waarom een release kan falen)

| Guard | Eis |
|-------|-----|
| CalVer-formaat | `vYYYY.M.D[.MICRO]`, geen voorloopnullen |
| Changelog | Een niet-lege `## [versie]`-sectie moet bestaan |
| Plugin-versie | De assessments-plugin moet op dezelfde CalVer staan als de tag |
| Publiccode-versie | `publiccode.yml` moet dezelfde CalVer en de bijbehorende `releaseDate` dragen |
| Downgrade | De tag moet de hoogste CalVer-tag zijn — fix forward, deploy nooit een oudere tag |
| Tag bestaat nog niet | Hertaggen is geen release — breng een fix uit onder een nieuwe, hogere tag |
| Tag op main | De getagde commit moet op `main` staan |
| Image bestaat | De `Deploy acceptatie`-run voor die commit moet geslaagd zijn |
| Dispatchbaar | `deploy-productie.yaml` moet op de default branch (`main`) staan, anders kan `release.yaml` het niet starten — zet de eerste CalVer-tag pas na de merge naar `main` |

Via `tag-release` vallen deze guards **vóór** de tag, dus een misser laat niets
achter. `release.yaml` en `deploy-productie.yaml` houden hun eigen guards als
vangnet voor een tag die alsnog met de hand gepusht wordt.

De gedeelde checks staan in `script/ci/` (`validate-calver-tag.sh`,
`changelog-section.sh`, `assert-newest-calver-tag.sh`,
`assert-plugin-version.sh`, `assert-publiccode-version.sh`,
`assert-tag-absent.sh`) en worden door
`tag-release.yaml`, `release.yaml` en `deploy-productie.yaml` gebruikt; ze zijn
gedekt door `script/tests/test_ci_release.py`.

## Hotfix

Een spoedfix gaat **vooruit**, niet terug: breng de fix aan op `main` en geef
'm een nieuwe, hogere CalVer-tag. Een oudere tag (her)taggen en deployen wordt
door de downgrade-guard geblokkeerd, omdat dat productie naar oude code zou
terugzetten.
