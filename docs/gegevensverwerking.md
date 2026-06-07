# Gegevensverwerking Invulhulpen

## Status

Dit document beschrijft welke persoonsgegevens Invulhulpen verwerkt. Het dient als input voor privacy-gerelateerde besluitvorming.

**Te bespreken met het team:**

- Bewaartermijnen en archivering (zie [Archivering](#archivering))
- E-mailnotificatie bij uitnodiging van nieuwe leden
- Pre-scan DPIA formaliseren als bijlage
- Soft delete i.p.v. permanent verwijderen (zie [Aanbevelingen](#aanbevelingen))
- Bewaartermijn configureerbaar maken per organisatie
- Export voor archivering (PDF/A, JSON) conform DUTO-eisen
- Bewaartermijnenbeleid documenteren (vereist door AP)

## Verwerkte persoonsgegevens

| Gegeven | Bron | Doel | Bewaartermijn |
|---------|------|------|---------------|
| E-mailadres | Keycloak (OIDC login) | Authenticatie, autorisatie, samenwerking | Zolang account actief is |
| Weergavenaam | Keycloak (OIDC login) | Identificatie in bewerkingsgeschiedenis | Zolang account actief is |
| OIDC Subject ID | Keycloak (OIDC login) | Koppeling met identity provider | Zolang account actief is |
| Registratietijdstip | Automatisch bij eerste login | Accountbeheer | Zolang account actief is |
| Projectlidmaatschap | Gebruikersinvoer (uitnodiging) | Rolgebaseerde toegangscontrole | Zolang project bestaat |
| Uitnodigings- en acceptatietijdstip | Automatisch bij uitnodiging/eerste login | Audit trail lidmaatschap | Zolang project bestaat |
| Bewerkingsgeschiedenis | Automatisch bij opslaan | Audit trail, verantwoording | Zolang assessment bestaat |
| Assessment-antwoorden | Gebruikersinvoer | Kernfunctionaliteit DPIA-proces | Zolang assessment bestaat |
| IP-adres en request-metadata | Automatisch (serverlogboeken) | Beveiliging, foutopsporing | Conform logrotatie-instellingen server |

## Rechtsgrond

**Gerechtvaardigd belang** ([artikel 6, lid 1, sub f AVG][avg-art6]).

Onderbouwing: De Pre-scan DPIA van deze applicatie wijst uit dat een volledige DPIA niet verplicht is, gezien:

- De beperkte schaal van de verwerking (alleen medewerkers die actief DPIA's uitvoeren)
- Het niet-gevoelige karakter van de verwerkte gegevens (e-mail, naam)
- Het gerechtvaardigd belang bij traceerbare samenwerking aan privacy-assessments

## Gegevenssynchronisatie

Bij elke authenticatie worden het e-mailadres en de weergavenaam uit Keycloak gesynchroniseerd met de lokale database. Als een gebruiker deze gegevens wijzigt in de identity provider, worden ze automatisch bijgewerkt bij de eerstvolgende login.

## Rate limiting

De API hanteert een limiet van 100 verzoeken per minuut per IP-adres (via `@fastify/rate-limit`). Hiervoor worden IP-adressen tijdelijk in het geheugen bijgehouden. Deze gegevens worden niet persistent opgeslagen.

## Ontvangers

Persoonsgegevens worden niet gedeeld met derden en niet doorgegeven aan landen buiten de Europese Economische Ruimte (EER). De gegevens zijn uitsluitend toegankelijk voor:

- Gebruikers die lid zijn van hetzelfde project
- Systeembeheerders

## Beveiligingsmaatregelen

- Versleutelde verbindingen (TLS)
- Authenticatie via SSO Rijk / RIG Keycloak (OpenID Connect)
- Rolgebaseerde toegangscontrole (eigenaar, bewerker, lezer)
- Veld-niveau auditlogging (bewerkingsgeschiedenis)
- Security headers via `@fastify/helmet` (CSP, X-Frame-Options, etc.)
- Rate limiting (100 verzoeken per minuut per IP)

## Geautomatiseerde besluitvorming

De applicatie maakt geen gebruik van geautomatiseerde besluitvorming of profilering.

## Aandachtspunt: uitnodiging van leden

Bij het toevoegen van een lid aan een project wordt het e-mailadres opgeslagen, ook als de persoon nog niet eerder heeft ingelogd (placeholder-account). De betrokkene ontvangt momenteel **geen notificatie** hiervan. Dit is een aandachtspunt voor verdere ontwikkeling — overweeg een uitnodigingsmail of een melding bij eerste login.

## Archivering

### Huidige situatie

Wanneer een project wordt verwijderd, worden alle bijbehorende gegevens permanent verwijderd (cascade delete). Er is geen archiveringsfunctionaliteit.

### Richtlijnen

#### Archiefwet

De **[Archiefwet 1995][archiefwet-1995]** (en de [nieuwe Archiefwet][archiefwet-nieuw], aangenomen door de Tweede Kamer februari 2025, in behandeling bij de Eerste Kamer) is van toepassing op alle overheidsorganen. DPIA-documenten zijn **bedrijfsvoeringsdocumenten** die vallen onder de selectielijst van het betreffende overheidsorgaan.

De nieuwe Archiefwet introduceert:
- **Archivering by design** — archiveringscapaciteit inbouwen vanaf het begin
- **Verkorte overbrengingstermijn** — van 20 naar 10 jaar (voor documenten aangemaakt na inwerkingtreding)
- **Risicogebaseerd informatiebeheer**

#### AVG en bewaartermijnen voor DPIA's

- **De AVG stelt geen expliciete bewaartermijn** voor DPIA-documenten, maar [artikel 35 lid 11 AVG][avg-art35] vereist dat een DPIA wordt herzien wanneer de verwerking verandert ([WP29 WP248 rev.01][wp248]: minimaal elke 3 jaar)
- **Accountability-beginsel** ([art. 5 lid 2][avg-art5], [art. 24 AVG][avg-art24]): de verwerkingsverantwoordelijke moet compliance kunnen aantonen, wat inhoudt dat DPIA-documentatie bewaard moet worden zolang de verwerking actief is
- **De [Autoriteit Persoonsgegevens][ap-dpia]** schrijft geen specifieke bewaartermijn voor, maar beoordeelt of de gekozen termijn redelijk en onderbouwd is
- **Praktijkrichtlijn**: bewaar DPIA's voor de duur van de verwerking + 7 jaar (verjaringstermijn voor bestuursrechtelijke handhaving AVG-overtredingen). Sommige selectielijsten classificeren beleidsmatige DPIA's als "blijvend bewaren"

#### DUTO-raamwerk (Duurzame Toegankelijkheid van Overheidsinformatie)

Het [DUTO-raamwerk][duto] schrijft voor dat overheidsinformatie vindbaar, beschikbaar, leesbaar, interpreteerbaar en betrouwbaar moet blijven gedurende de gehele bewaartermijn. Dit betekent:
- Opslag in open formaten (JSON, PDF/A)
- Voldoende metadata (maker, datum, context, classificatie)
- Onderscheid tussen actieve, semi-statische, gearchiveerde en vernietigde records

### Aanbevelingen

1. **Soft delete implementeren** — projecten en assessments markeren als "gearchiveerd" in plaats van permanent verwijderen, met vernietigingslogging
2. **Bewaartermijn configureerbaar maken** — per organisatie instelbaar op basis van eigen selectielijst
3. **Export voor archivering** — PDF/A- en JSON-export als archiefwaardig formaat aanbieden, in lijn met DUTO-eisen
4. **Automatische notificatie** — gebruikers waarschuwen wanneer de bewaartermijn nadert
5. **Bewaartermijnenbeleid documenteren** — de gekozen bewaartermijnen en onderbouwing vastleggen (vereist door AP)

[avg-art5]: https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=CELEX:32016R0679 "AVG artikel 5 — Beginselen inzake verwerking van persoonsgegevens"
[avg-art6]: https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX%3A32016R0679#d1e1883-1-1 "AVG artikel 6 — Rechtmatigheid van de verwerking"
[avg-art24]: https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=CELEX:32016R0679 "AVG artikel 24 — Verantwoordelijkheid van de verwerkingsverantwoordelijke"
[avg-art35]: https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=CELEX:32016R0679 "AVG artikel 35 — Gegevensbeschermingseffectbeoordeling"
[wp248]: https://ec.europa.eu/newsroom/article29/item-detail.cfm?item_id=611236 "WP29 Guidelines on DPIA (WP248 rev.01, 4 oktober 2017)"
[ap-dpia]: https://www.autoriteitpersoonsgegevens.nl/en/themes/basic-gdpr/gdpr-in-practice/data-protection-impact-assessment-dpia "Autoriteit Persoonsgegevens — DPIA"
[archiefwet-1995]: https://wetten.overheid.nl/BWBR0007376/ "Archiefwet 1995 — wetten.overheid.nl"
[archiefwet-nieuw]: https://www.eerstekamer.nl/wetsvoorstel/35968_archiefwet_20 "Archiefwet 20.. (35.968) — Eerste Kamer"
[duto]: https://www.nationaalarchief.nl/archiveren/kennisbank/duto-raamwerk "DUTO-raamwerk — Nationaal Archief"
