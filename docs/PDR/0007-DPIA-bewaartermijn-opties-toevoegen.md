# 0007: Bewaartermijn opties toevoegen

Datum: 2025-05-21

## Status

Voorgesteld

## Besluit

We wijzigen het veld voor bewaartermijn/archiveringsperiode van een vrij tekstveld (`text_input`) naar een keuzelijst (`select_option`) met gestandaardiseerde opties.

## Achtergrond

In de huidige implementatie wordt de bewaartermijn als vrije tekst ingevoerd, wat leidt tot inconsistente formaten en moeilijk te analyseren gegevens. Door standaardopties aan te bieden zoals in de pre-scan DPIA, kunnen we consistentie bevorderen en dataverwerking vereenvoudigen.

## Overweging

- Consistentie tussen pre-scan en volledige DPIA
- Standaardisatie verbetert analyseerbaarheid van bewaartermijnen
- Vooraf gedefinieerde opties maken invullen eenvoudiger voor gebruikers

## Details

De volgende wijziging wordt doorgevoerd:

Wijzigen van veldtype:
- Van: `text_input` (vrije tekst)
- Naar: `select_option` (keuzelijst)

Met de volgende vooraf gedefinieerde opties:
- "Aantal jaren"
- "Jaar"
- "Minder dan 1 maand"
- "Minder dan 1 week"
- "Minder dan 24 uur"

Technische implementatie:
- Wijziging in DPIA.yaml bij de task met id: "10.1.1.4"
- Toevoegen van options-array met bovenstaande values

## Impact

### Gebruikers
- Eenvoudiger invoer door vooraf gedefinieerde keuzes
- Mogelijk migratie nodig voor bestaande vrije tekst invoer


### Datamodel
- Bewaartermijnen zijn in lijn tussen pre-scan DPIA en DPIA
