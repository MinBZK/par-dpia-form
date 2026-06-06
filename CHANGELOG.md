# Changelog

Alle noemenswaardige wijzigingen aan dit project worden gedocumenteerd in dit
bestand. Het formaat is gebaseerd op
[Keep a Changelog](https://keepachangelog.com/nl/1.1.0/). Het project volgt
[Calendar Versioning](https://calver.org/) in de vorm `YYYY.0M.0D`
(bijvoorbeeld `2026.06.06`). Releases tot en met [0.1.3] (4 juni 2026) volgden
Semantic Versioning; daarna is het project overgestapt op Calendar Versioning.

Per release staan eerst de wijzigingen die voor gebruikers van de invulhulp
merkbaar zijn. Meer technische wijzigingen (zoals dependency-updates, CI en
build) staan kort onder "Onder de motorkap".

## [Unreleased]

### Onder de motorkap

* Geautomatiseerde releases ingericht op basis van deze changelog.
* Diverse dependency-updates (@types/node 25, @vitejs/plugin-vue 6.0.6,
  @types/pdfmake 0.3, string-strip-html 13.5).

## [0.1.3] - 2026-06-04

### Toegevoegd

* IAMA (Impact Assessment Mensenrechten en Algoritmes) toegevoegd aan de
  invulhulp.

### Gewijzigd

* Links in de beslishulp voor de AI-verordening gecorrigeerd.

### Onder de motorkap

* `publiccode.yml` toegevoegd voor publicatie als open source.
* pre-commit en PR-preview toegevoegd aan de CI.
* Diverse dependency-updates (o.a. Vite 7, pdfmake 0.3, ESLint 9.38).

## [0.1.2] - 2025-06-26

### Gewijzigd

* Het begrippenkader wordt automatisch gesynchroniseerd met de externe bron,
  zodat definities actueel blijven.

### Onder de motorkap

* Release-workflow aangepast: via een pull request in plaats van een push naar
  `main`.
* Diverse dependency-updates.

## [0.1.1] - 2025-06-18

### Gewijzigd

* Tekstuele aanpassingen aan de IAMA-teksten.

## [0.1.0] - 2025-06-02

### Gewijzigd

* Naam en introductietekst van de tool bijgewerkt.

## [0.0.013] - 2025-05-27

### Gewijzigd

* Nummering van de vragen gedetailleerder en consistenter gemaakt.
* Begrippenkader en datamodel bijgewerkt.

### Verwijderd

* Pre-scan: vragen over gebruikersgroepen verwijderd.

### Onder de motorkap

* Beschrijvingen toegevoegd aan de documentatiebestanden.
* Diverse dependency-updates.

## [0.0.12] - 2025-05-22

### Toegevoegd

* Vragen over bewaartermijn en omvang van de gegevensset.

## [0.0.11] - 2025-05-22

### Gewijzigd

* Rechtsgrond afgestemd op het datamodel.
* Diverse tekst- en lay-outverbeteringen.

### Onder de motorkap

* Aanvullende Product Decision Records (PDR's) toegevoegd.

## [0.0.10] - 2025-05-20

### Gewijzigd

* Pre-scan en DPIA kunnen nu ongeacht de namespace worden geüpload.

### Onder de motorkap

* Diverse dependency-updates.

## [0.0.9] - 2025-05-19

### Onder de motorkap

* Diverse dependency-updates.

## [0.0.8] - 2025-05-13

### Onder de motorkap

* Controle op kapotte links en op ontbrekende definities toegevoegd aan de CI.

## [0.0.7] - 2025-05-09

### Opgelost

* Diverse fouten hersteld.

## [0.0.6] - 2025-05-09

### Opgelost

* Diverse fouten hersteld.

## [0.0.5] - 2025-05-09

### Toegevoegd

* Fijnmazigere resultaten van de pre-scan.

## [0.0.4] - 2025-05-09

### Toegevoegd

* Pre-scan is verplicht bij beleid of wetgeving.

### Gewijzigd

* Homepagina en styling bijgewerkt.

### Onder de motorkap

* Contributing-bestanden en bekende beperkingen gedocumenteerd.

## [0.0.3] - 2025-05-08

### Onder de motorkap

* Releaseproces via Git-tags ingericht.

## [0.0.2] - 2025-05-08

### Onder de motorkap

* Releaseproces via Git-tags ingericht.

## [0.0.1] - 2025-05-08

### Toegevoegd

* Eerste versie van de invulhulp: een DPIA-formulier op basis van het NL Design
  System, met formulierlogica, voortgangsindicatie en navigatie.

### Onder de motorkap

* Projectopzet en eerste dependency-configuratie.

[Unreleased]: https://github.com/MinBZK/par-dpia-form/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.3
[0.1.2]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.2
[0.1.1]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.1
[0.1.0]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.1.0
[0.0.013]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.013
[0.0.12]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.12
[0.0.11]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.11
[0.0.10]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.10
[0.0.9]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.9
[0.0.8]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.8
[0.0.7]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.7
[0.0.6]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.6
[0.0.5]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.5
[0.0.4]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.4
[0.0.3]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.3
[0.0.2]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.2
[0.0.1]: https://github.com/MinBZK/par-dpia-form/releases/tag/v0.0.1
