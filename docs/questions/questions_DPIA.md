# Question Overview for DPIA Rapportagemodel Rijksdienstyaml

| Question ID | Question | Type | Options | Related Questions |
|------------|----------|------|---------|-------------------|
| 0 | Vaststelling | task_group |  |  |
| 0.1 |   Verwerkingsverantwoordelijke | task_group |  |  |
| 0.1.1 |     Organisatie | text_input |  |  |
| 0.1.2 |     Directie | text_input |  |  |
| 0.1.3 |     Afdeling | text_input |  |  |
| 0.1.4 |     Naam | text_input |  |  |
| 0.1.5 |     Functie | text_input |  |  |
| 0.1.6 |     Datum ondertekening | date |  |  |
| 0.1.7 |     Opgesteld door afdeling | text_input |  |  |
| 0.2 |   Advies functionaris voor gegevensbescherming (FG) | task_group |  |  |
| 0.2.1 |     Organisatie | text_input |  |  |
| 0.2.2 |     Directie | text_input |  |  |
| 0.2.3 |     Afdeling | text_input |  |  |
| 0.2.4 |     Naam | text_input |  |  |
| 0.2.5 |     Functie | text_input |  |  |
| 0.2.6 |     Datum advies | date |  |  |
| 0.2.7 |     Advies FG in document (naam document) | text_input |  |  |
| 0.2.8 |     Advies FG verwerkt in versie (versienummer) | text_input |  |  |
| 0.3 |   Documentbeheerder | task_group |  |  |
| 0.3.1 |     Organisatie | text_input |  |  |
| 0.3.2 |     Directie | text_input |  |  |
| 0.3.3 |     Afdeling | text_input |  |  |
| 0.3.4 |     Naam | text_input |  |  |
| 0.3.5 |     Functie | text_input |  |  |
| 0.3.6 |     Opslaglocatie | text_input |  |  |
| 0.4 |   Versie | task_group |  |  |
| 0.4.1 |     DPIA versie | text_input |  |  |
| 0.4.2 |     Datum | text_input |  |  |
| 0.4.3 |     Toelichting | text_input |  |  |
| 0.5 |   Status | select_option | concept; definitief |  |
| 0.6 |   DPIA dossier | task_group |  |  |
| 0.6.1 |     Grootte (aantal documenten) | text_input |  |  |
| 0.6.2 |     Documenten | task_group |  |  |
| 0.6.2.1 |       Document soort | text_input |  |  |
| 0.6.2.2 |       Document naam | text_input |  |  |
| 0.6.2.3 |       Document versie | text_input |  |  |
| 0.6.2.4 |       Document locatie | text_input |  |  |
| 1 | Inleiding | open_text |  |  |
| 2 | Voorstel | task_group |  |  |
| 2.1 |   Voorstel | open_text |  |  |
| 2.2 |   Afbeeldingen | task_group |  |  |
| 2.2.1 |     Afbeelding | text_input |  |  |
| 3 | Persoonsgegevens | task_group |  |  |
| 3.1 |   Persoonsgegevens | task_group |  |  |
| 3.1.1 |     Persoonsgegeven | text_input |  |  |
| 3.1.2 |     Categorie betrokkene | text_input |  |  |
| 3.1.3 |     Categorie persoonsgegevens | text_input |  |  |
| 3.1.4 |     Type persoonsgegeven | select_option | gewoon; gevoelig; bijzonder; strafrechtelijk; nationaal identificatienummer |  |
| 3.1.5 |     Oorspronkelijk verwerkingsdoeleinde | text_input |  |  |
| 3.1.6 |     Bron betrokkenen | radio_option | False; True |  |
| 3.1.7 |     Partij naam | text_input |  | Show if 3.1.6 |
| 3.1.8 |     Bron tool/platform | text_input |  | Show if 3.1.6 |
| 3.1.9 |     Verstrekkingsgrond | text_input |  | Show if 3.1.6 |
| 3.3 |   Aanvullende informatie over de persoonsgegevens | open_text |  |  |
| 4 | Gegevensverwerking | task_group |  |  |
| 4.1 |   Gegevensverwerking, Categorieën betrokkenen & persoonsgegevens | task_group |  |  |
| 4.1.1 |     Naam van de gegevensverwerking | text_input |  |  |
| 4.1.2 |     Beschrijving van de gegevensverwerking | text_input |  |  |
| 4.1.3 |     Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 4.2 |   Aanvullende informatie over de gegevensverwerking | open_text |  |  |
| 4.3 |   Samenhang gegevensverwerkingen | task_group |  |  |
| 4.3.1 |     Samenhang tussen de gegevensverwerkingen | text_input |  |  |
| 5 | Technieken en methoden van de gegevensverwerkingen | open_text |  |  |
| 6 | Verwerkingsdoeleinden | task_group |  |  |
| 6.1 |   Gegevensverwerking & verwerkingsdoeleinde | task_group |  | Copy from 4.1.1 |
| 6.1.1 |     Verwerkingsdoeleinde | open_text |  |  |
| 6.2 |   Aanvullende informatie over de verwerkingsdoeleinden | open_text |  |  |
| 7 | Betrokken partijen | task_group |  |  |
| 7.1 |   Gegevensverwerking betrokken partijen | task_group |  | Copy from 4.1.1 |
| 7.1.1 |     Betrokken partij | task_group |  |  |
| 7.1.1.1 |       Partij naam | text_input |  |  |
| 7.1.1.2 |       Partij rol | select_option | verwerkingsverantwoordelijke; gezamenlijke verwerkingsverantwoordelijke; verwerker; sub-verwerker; verstrekker; ontvanger; betrokkene; derde |  |
| 7.1.1.3 |       Functies/afdelingen | text_input |  |  |
| 7.1.1.4 |       Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 7.1.1.5 |       Categorieën betrokkene | checkbox_option |  | Options from 3.1.2 |
| 7.2 |   Aanvullende informatie over de betrokken partijen | open_text |  |  |
| 8 | Belangen bij de gegevensverwerkingen | task_group |  |  |
| 8.1 |   Betrokken partij, belangen, uitkomst consultatie betrokkenen | task_group |  | Copy from 7.1.1.1 |
| 8.1.1 |     Belang, uitkomst consultatie betrokkenen | open_text |  |  |
| 8.2 |   Aanvullende informatie over de belangen | open_text |  |  |
| 9 | Verwerkingslocaties | task_group |  |  |
| 9.1 |   Gegevensverwerking, verwerkingslocatie, doorgiftemechanisme, maatregelen | task_group |  | Copy from 4.1.1 |
| 9.1.1 |     Verwerkingslocaties | task_group |  |  |
| 9.1.1.1 |       Verwerkingslocatie | text_input |  |  |
| 9.1.1.2 |       Doorgiftemechanisme | select_option | Adequaatheidsbesluit; Binding Corporate Rules (BCR); Standaard contractsbepalingen (SCC); Artikel 49 AVG uitzondering; Niet van toepassing (binnen EER) |  |
| 9.1.1.3 |       Maatregelen | text_input |  |  |
| 9.2 |   Aanvullende informatie over de verwerkingslocaties | open_text |  |  |
| 10 | Juridisch en beleidsmatig kader | task_group |  |  |
| 10.1 |   Gegevensverwerkingen, juridisch en/of beleidsmatigkader, Wetsartikelen | task_group |  | Copy from 4.1.1 |
| 10.1.1 |     Juridisch en beleidsmatig kader | task_group |  |  |
| 10.1.1.1 |       Juridisch en/of beleidsmatig kader | text_input |  |  |
| 10.1.1.2 |       Wetsartikelen | text_input |  |  |
| 10.2 |   Aanvullende informatie toe over het juridische en beleidsmatig kader | open_text |  |  |
| 11 | Bewaartermijnen | task_group |  |  |
| 11.1 |   Gegevensverwerking, verwerkingsdoeleinde, categorie betrokkene & persoonsgegevens, bewaartermijn archiveringsperiode & motivatie bewaartermijn | task_group |  | Copy from 4.1.1 |
| 11.1.1 |     Bewaartermijnen | task_group |  |  |
| 11.1.1.1 |       Verwerkingsdoeleinde | text_input |  | Copy from 6.1.1 |
| 11.1.1.2 |       Categorie betrokkene | checkbox_option |  | Options from 3.1.2 |
| 11.1.1.3 |       Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 11.1.1.4 |       Bewaartermijn/archiveringsperiode | text_input |  |  |
| 11.1.1.5 |       Motivatie bewaartermijn | open_text |  |  |
| 11.2 |   Aanvullende informatie over de bewaartermijnen | open_text |  |  |
| 12 | Rechtsgrond | task_group |  |  |
| 12.1 |   Gegevensverwerking, Rechtsgrond, toelichting op de rechtsgrond | task_group |  | Copy from 4.1.1 |
| 12.1.1 |     Rechtsgrond | task_group |  |  |
| 12.1.1.1 |       Rechtsgrond | select_option | Toestemming; Noodzakelijk voor de uitvoering van de overeenkomst; Noodzakelijk om te voldoen aan een wettelijke verplichting; Noodzakelijk om de vitale belangen te beschermen; Noodzakelijk voor de vervulling van een taak van algemeen belang; Noodzakelijk voor de behartiging van een gerechtvaardigd belang |  |
| 12.1.1.2 |       Toelichting op de rechtsgrond | open_text |  |  |
| 12.2 |   Aanvullende informatie over de rechtsgronden | open_text |  |  |
| 13 | Bijzondere persoonsgegevens, strafrechtelijke persoonsgegevens en nationale identificatienummers | task_group |  |  |
| 13.1 |   Bijzondere persoonsgegevens | task_group |  |  |
| 13.1.1 |     Bijzondere persoonsgegevens | radio_option | False; True |  |
| 13.1.2 |     Bijzondere persoonsgegevens | task_group |  | Show if 13.1.1 |
| 13.1.2.1 |       Gegevensverwerking | checkbox_option |  | Options from 4.1.1 |
| 13.1.2.2 |       Categorie betrokkene | checkbox_option |  | Options from 3.1.2 |
| 13.1.2.3 |       Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 13.1.2.4 |       Type bijzondere persoonsgegevens | select_option | Ras of etnische afkomst; Politieke opvattingen; Religieuze of levensbeschouwelijke overtuigingen; Lidmaatschap van een vakbond; Genetische gegevens; Biometrische gegevens; Gezondheidsgegevens; Seksuele gerichtheid; Strafrechtelijke gegevens; Nationaal identificatienummer |  |
| 13.2.2.4 |       Doorbrekingsgrond | open_text |  |  |
| 13.2 |   Strafrechtelijke persoonsgegevens | task_group |  |  |
| 13.2.1 |     Strafrechtelijke persoonsgegevens | radio_option | False; True |  |
| 13.2.2 |     Strafrechtelijke persoonsgegegevens | task_group |  | Show if 13.2.1 |
| 13.2.2.1 |       Gegevensverwerking | checkbox_option |  | Options from 4.1.1 |
| 13.2.2.2 |       Categorie betrokkene | checkbox_option |  | Options from 3.1.2 |
| 13.2.2.3 |       Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 13.2.2.4 |       Uitzonderingsgrond | open_text |  |  |
| 13.3 |   Nationale identificatienummers | task_group |  |  |
| 13.3.1 |     Nationale identificatienummers | radio_option | False; True |  |
| 13.3.2 |     Nationale identificatienummers | task_group |  | Show if 13.3.1 |
| 13.3.2.1 |       Gegevensverwerking | checkbox_option |  | Options from 4.1.1 |
| 13.3.2.2 |       Categorie betrokkene | checkbox_option |  | Options from 3.1.2 |
| 13.3.2.3 |       Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 13.3.2.4 |       Uitzonderingsgrond | open_text |  |  |
| 13.4 |   Aanvullende informatie over de bijzondere persoonsgegevens, strafrechtelijke persoonsgegevens en nationale identificatienummers | open_text |  |  |
| 14 | Doelbinding | task_group |  |  |
| 14.1 |   Gegevensverwerking, categorie betrokkenen & persoonsgegevens, doeleinde & oorspronkelijk doeleinde | task_group |  | Copy from 4.1.1 |
| 14.1.1 |     Doelbinding | task_group |  |  |
| 14.1.1.1 |       Categorie betrokkene | checkbox_option |  | Options from 3.1.2 |
| 14.1.1.2 |       Persoonsgegevens | checkbox_option |  | Options from 3.1.1 |
| 14.1.1.3 |       Doeleinde | text_input |  |  |
| 14.1.1.4 |       Oorspronkelijke doeleinde | text_input |  |  |
| 14.2 |   Aanvullende informatie over de verenigbaarheid en toelaatbaarheid | open_text |  |  |
| 15 | Noodzaak en evenredigheid | task_group |  |  |
| 15.1 |   De beoordeling van de subsidiariteit | open_text |  |  |
| 15.2 |   De beoordeling van de proportionaliteit | open_text |  |  |
| 16 | Rechten van de betrokkenen | task_group |  |  |
| 16.1 |   Recht van inzage | task_group |  |  |
| 16.1.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.1.2 |     Toelichting op procedure ter invulling van het recht van de betrokkene | open_text |  | Show if 16.1.1 |
| 16.1.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.1.4 |     Beperking toelichting | open_text |  | Show if 16.1.3 |
| 16.2 |   Recht op rectificatie en aanvulling | task_group |  |  |
| 16.2.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.2.2 |     Procedure toelichting | open_text |  | Show if 16.2.1 |
| 16.2.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.2.4 |     Beperking toelichting | open_text |  | Show if 16.2.3 |
| 16.3 |   Recht op vergetelheid | task_group |  |  |
| 16.3.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.3.2 |     Procedure toelichting | open_text |  | Show if 16.3.1 |
| 16.3.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.3.4 |     Beperking toelichting | open_text |  | Show if 16.3.3 |
| 16.4 |   Recht op beperking van de verwerking | task_group |  |  |
| 16.4.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.4.2 |     Procedure toelichting | open_text |  | Show if 16.4.1 |
| 16.4.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.4.4 |     Beperking toelichting | open_text |  | Show if 16.4.3 |
| 16.5 |   Recht op dataportabiliteit | task_group |  |  |
| 16.5.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.5.2 |     Procedure toelichting | open_text |  | Show if 16.5.1 |
| 16.5.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.5.4 |     Beperking toelichting | open_text |  | Show if 16.5.3 |
| 16.6 |   Recht niet onderworpen te worden aan uitsluitend geautomatiseerde besluitvorming | task_group |  |  |
| 16.6.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.6.2 |     Procedure toelichting | open_text |  | Show if 16.6.1 |
| 16.6.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.6.4 |     Beperking toelichting | open_text |  | Show if 16.6.3 |
| 16.7 |   Recht om bezwaar te maken | task_group |  |  |
| 16.7.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.7.2 |     Procedure toelichting | open_text |  | Show if 16.7.1 |
| 16.7.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.7.4 |     Beperking toelichting | open_text |  | Show if 16.7.3 |
| 16.8 |   Recht op duidelijke informatie | task_group |  |  |
| 16.8.1 |     Procedures ter uitvoering | radio_option | False; True; None |  |
| 16.8.2 |     Procedure toelichting | open_text |  | Show if 16.8.1 |
| 16.8.3 |     Beperking op grond van wettelijke uitzondering | radio_option | True; None |  |
| 16.8.4 |     Beperking toelichting | open_text |  | Show if 16.8.3 |
| 17 | Risico’s voor betrokkenen | task_group |  |  |
| 17.1 |   Risico's voor de betrokkenen | task_group |  |  |
| 17.1.1 |     Beschrijving van het risico | open_text |  |  |
| 17.1.2 |     Oorsprong | open_text |  |  |
| 17.1.3 |     Kans | select_option | laag; midden; hoog |  |
| 17.1.4 |     Motivatie van de kans | text_input |  |  |
| 17.1.5 |     Impact | select_option | laag; midden; hoog |  |
| 17.1.6 |     Motivatie van de impact | text_input |  |  |
| 17.1.7 |     Risiconiveau | select_option | laag; midden; hoog |  |
| 17.1.8 |     Motivatie van de risicoinschatting | text_input |  |  |
| 17.2 |   Aanvullende informatie over de risico’s | open_text |  |  |
| 18 | Maatregelen | task_group |  |  |
| 18.1 |   Risico, Oorsprong, Maatregelen, Resterende risico en risico-inschatting & beheerder van maatregelen | task_group |  |  |
| 18.1.1 |     Risico | checkbox_option |  | Options from 17.1.1 |
| 18.1.2 |     Oorsprong | text_input |  |  |
| 18.1.3 |     Maatregelen | text_input |  |  |
| 18.1.4 |     Resterend risico en de risicoinschatting | select_option | laag; midden; hoog |  |
| 18.1.5 |     Beheerder van de maatregelen | text_input |  |  |
| 18.2 |   Aanvullende informatie over de maatregelen | open_text |  |  |
| 18.3 |   Onderbouwing acceptatie resterende risico's | open_text |  |  |
| 19 | Managementsamenvatting  | open_text |  |  |
| 20 | Ondertekening | task_group |  |  |
| 0.7.1 |   Organisatie, directie, afdeling verwerkingsverantwoordelijke(n) | text_input |  |  |
| 0.7.2 |   Naam verwerkingsverantwoordelijke(n) | text_input |  |  |
| 0.7.3 |   Functie verwerkingsverantwoordelijke(n) | text_input |  |  |
| 0.7.4 |   Datum ondertekening | date |  |  |
