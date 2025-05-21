# 0006: Harmonisatie rechtsgrond terminologie in DPIA en pre-scan DPIA

Datum: 2025-05-21

## Status

Voorgesteld

## Besluit

We standardiseren de terminologie voor rechtsgronden in zowel de pre-scan DPIA als de DPIA zelf door consistent het prefix "Rechtsgrond" te gebruiken bij alle opties en de inhoudelijke beschrijvingen te harmoniseren.

## Achtergrond

In de huidige implementatie van zowel de pre-scan DPIA als de volledige DPIA worden inconsistente termen gebruikt voor dezelfde rechtsgronden voor gegevensverwerking. Uit de code blijkt dat in sommige delen alleen de beschrijving wordt gebruikt (bijv. "Toestemming betrokkene"), terwijl in andere delen het prefix "Rechtsgrond" wordt toegevoegd (bijv. "Rechtsgrond toestemming"). Deze inconsistentie veroorzaakt verwarring bij gebruikers en kan leiden tot onjuiste interpretaties van gegevens bij analyses en rapportages.

## Details

**De volgende wijzigingen worden doorgevoerd:**
- Van: "Toestemming betrokkene" → Naar: "Rechtsgrond toestemming"
- Van: "Toestemming" → Naar: "Rechtsgrond toestemming"
- Van: "Noodzakelijk voor overeenkomst" → Naar: "Rechtsgrond noodzakelijk voor de uitvoering van een overeenkomst"
- Van: "Wettelijke plicht" → Naar: "Rechtsgrond wettelijke verplichting"
- Van: "Noodzakelijk om te voldoen aan een wettelijke verplichting" → Naar: "Rechtsgrond wettelijke verplichting"
- Van: "Vitaal belang" → Naar: "Rechtsgrond vitaal belang"
- Van: "Noodzakelijk om de vitale belangen te beschermen" → Naar: "Rechtsgrond vitaal belang"
- Van: "Taak van algemeen belang" → Naar: "Rechtsgrond taak van algemeen belang"
- Van: "Noodzakelijk voor de vervulling van een taak van algemeen belang" → Naar: "Rechtsgrond taak van algemeen belang"
- Van: "Gerechtvaardigd belang" → Naar: "Rechtsgrond gerechtvaardigd belang"
- Van: "Noodzakelijk voor de behartiging van een gerechtvaardigd belang" → Naar: "Rechtsgrond gerechtvaardigd belang"

## Impact

### Gebruikers
- Verbeterde consistentie en duidelijkheid bij het invullen van de DPIA
- Tijdelijke verwarring mogelijk bij gebruikers die gewend zijn aan de oude terminologie
- Trainingsmateriaal moet worden bijgewerkt

### Datamodel
- In lijn met datamodel
