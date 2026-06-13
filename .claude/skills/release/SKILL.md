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
   ## [2026.6.14] - 2026-06-14
   ```

   (versie zonder de `v`-prefix en zonder voorloopnullen). Laat een lege
   `## [Unreleased]` achter. Breng dit via een PR naar `main`.

2. **Zorg dat acceptatie groen is.** De tag promoot het image dat voor de
   main-commit is gebouwd; de `Deploy acceptatie`-run voor die commit moet
   geslaagd zijn (anders bestaat het te promoten image niet).

3. **Tag zetten en pushen** op de juiste main-commit:

   ```bash
   git tag v2026.6.14
   git push origin v2026.6.14
   ```

## Wat er daarna automatisch gebeurt

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
| Downgrade | De tag moet de hoogste CalVer-tag zijn — fix forward, deploy nooit een oudere tag |
| Tag op main | De getagde commit moet op `main` staan |
| Image bestaat | De `Deploy acceptatie`-run voor die commit moet geslaagd zijn |
| Dispatchbaar | `deploy-productie.yaml` moet op de default branch (`main`) staan, anders kan `release.yaml` het niet starten — zet de eerste CalVer-tag pas na de merge naar `main` |

De gedeelde checks staan in `script/ci/` (`validate-calver-tag.sh`,
`changelog-section.sh`, `assert-newest-calver-tag.sh`) en worden door zowel
`release.yaml` als `deploy-productie.yaml` gebruikt; ze zijn gedekt door
`script/tests/test_ci_release.py`.

## Hotfix

Een spoedfix gaat **vooruit**, niet terug: breng de fix aan op `main` en geef
'm een nieuwe, hogere CalVer-tag. Een oudere tag (her)taggen en deployen wordt
door de downgrade-guard geblokkeerd, omdat dat productie naar oude code zou
terugzetten.
