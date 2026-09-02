# Review Fix/prescan-weighted-scores

## Approve-comment

Goedgekeurd. Keys matchen nu de optie-waarden, gewichten ongewijzigd, en de invariant-test vangt een toekomstige mismatch.

In een losse PR voeg ik nog toe:
- een test voor 1.4.1 (kind <16 → betrokkenen = 3), die ontbreekt nog
- een test op het eindoordeel: 1.4.1 + 5.1.2 → "DPIA verplicht". De huidige test stopt bij `calculatedScores`; het oordeel is wat de gebruiker ziet en wat hier misging
- `weightedCountMap` laten melden in `calculationErrors` bij een onbekende key, i.p.v. stil 0

Op termijn: gewicht op de optie zelf (`weight: 3`) i.p.v. losse lijst met dubbele strings. Maak ik een issue voor.

## Context

`weightedCountMap` doet letterlijke string-lookup. Optie-waarden hadden prefix (`Categorie betrokkenen: `, `Basisregistratie: `), keys niet → scoreKey altijd 0. Antwoorden stonden wel in samenvatting, telden niet mee in `sum > 4` (prescan.yaml:1040).
