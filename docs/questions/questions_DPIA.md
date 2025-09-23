# Task Overview for DPIA Rapportagemodel Rijksdienst

| Task ID | Task | Description | Type | Options | Related tasks |
|------------|----------|-------------------|------|---------|-------------------|
| 0 | Inleiding | Dit is het rapportagemodel van het Rijksmodel DPIA. Een DPIA wordt uitgevoerd door de 17 paragraf... | open_text |  |  |
| 1 | Voorstel | Beschrijf het voorstel waar de DPIA op toeziet op hoofdlijnen en benoem hoe het voorstel tot stan... | task_group |  |  |
| 1.1 |   Voorstel |  | open_text |  |  |
| 1.2 |   Afbeeldingen | Afbeeldingen | task_group |  |  |
| 1.2.1 |     Afbeelding | Voeg een link toe naar de plek waar de afbeelding is opgeslagen. Dit kan een link naar een samenwerkruimte, een gedeelde map of een andere specifieke opslaglocatie zijn. | text_input |  |  |
| 2 | Persoonsgegevens | Beschrijf alle persoonsgegevens die worden verwerkt. Classificeer deze persoonsgegevens naar: <br... | task_group |  |  |
| 2.1 |   Persoonsgegevens |  | task_group |  |  |
| 2.1.1 |     Persoonsgegeven |  | text_input |  |  |
| 2.1.2 |     Categorie betrokkenen |  | text_input |  |  |
| 2.1.3 |     Categorie persoonsgegevens |  | text_input |  |  |
| 2.1.4 |     Type persoonsgegeven |  | select_option | gewoon; gevoelig; bijzonder; strafrechtelijk; nationaal identificatienummer |  |
| 2.1.5 |     Oorspronkelijk verwerkingsdoeleinde |  | text_input |  |  |
| 2.1.6 |     Bron persoonsgegevens | Zijn de persoonsgegevens via een betrokken partij gekomen? | radio_option | False; True |  |
| 2.1.7 |     Partij naam |  | text_input |  | Show if 2.1.6 |
| 2.1.8 |     Bron tool/platform |  | text_input |  | Show if 2.1.6 |
| 2.1.9 |     Rechtsgrond verstrekking |  | text_input |  | Show if 2.1.6 |
| 2.3 |   Aanvullende informatie over de persoonsgegevens | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 3 | Gegevensverwerking | Geef alle gegevensverwerkingen weer en geef aan welke persoonsgegevens van welke categorieën betr... | task_group |  |  |
| 3.1 |   Gegevensverwerking, Categorieën betrokkenen & persoonsgegevens | Verwerk elke gegevensverwerking afzonderlijk en klik op '+ Voeg extra gegevensverwerking, categorieën betrokkenen & persoonsgegevens' om een nieuwe gegevensverwerking toe te voegen. | task_group |  |  |
| 3.1.1 |     Gegevensverwerking naam |  | text_input |  |  |
| 3.1.2 |     Gegevensverwerking beschrijving |  | text_input |  |  |
| 3.1.3 |     Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 3.2 |   Aanvullende informatie over de gegevensverwerking | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 3.3 |   Samenhang gegevensverwerkingen |  | task_group |  |  |
| 3.3.1 |     Samenhang tussen de gegevensverwerkingen | Omdat de gegevensverwerkingen binnen het voorstel gecompliceerd kunnen zijn en het niet altijd gemakkelijk is om het geheel van gegevensverwerkingen in woorden uit te drukken is het van belang om de gegevensverwerkingen te visualiseren, bijvoorbeeld aan de hand van een input-proces-output model, stroomschema of workflow. | text_input |  |  |
| 4 | Technieken en methoden van de gegevensverwerkingen | Beschrijf op welke wijze en met gebruikmaking van welke technieken en methoden van gegevensverwer... | open_text |  |  |
| 5 | Verwerkingsdoeleinden | Beschrijf de doeleinden van alle gegevensverwerkingen. | task_group |  |  |
| 5.1 |   Gegevensverwerking & verwerkingsdoeleinde | De gegevensverwerking naam wordt overgenomen uit vraag 3. | task_group |  | Copy from 3.1.1 |
| 5.1.1 |     Verwerkingsdoeleinde |  | open_text |  |  |
| 5.2 |   Aanvullende informatie over de verwerkingsdoeleinden | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 6 | Betrokken partijen | Benoem alle partijen die betrokken zijn en deel deze in per gegevensverwerking. Deel deze partije... | task_group |  |  |
| 6.1 |   Gegevensverwerking betrokken partijen |  | task_group |  | Copy from 3.1.1 |
| 6.1.1 |     Betrokken partij |  | task_group |  |  |
| 6.1.1.1 |       Partij naam |  | text_input |  |  |
| 6.1.1.2 |       Partij rol | Primaire AVG-rollen zijn verwerkingsverantwoordelijke, gezamenlijke verwerkingsverantwoordelijke, verwerker of sub-verwerker, en derde. Procesrollen bij gegevensoverdracht zijn verstrekker en ontvanger. | checkbox_option | Verwerkingsverantwoordelijke; Gezamenlijke verwerkingsverantwoordelijke; Verwerker; Sub-verwerker; Derde; Verstrekker; Ontvanger |  |
| 6.1.1.3 |       Functies/afdelingen |  | text_input |  |  |
| 6.1.1.4 |       Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 6.1.1.5 |       Categorieën betrokkene |  | checkbox_option |  | Options from 2.1.2 |
| 6.2 |   Aanvullende informatie over de betrokken partijen | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 7 | Belangen bij de gegevensverwerkingen | Beschrijf alle belangen die de betrokken partijen hebben bij de gegevensverwerkingen. Vraag betro... | task_group |  |  |
| 7.1 |   Betrokken partij, belangen, uitkomst consultatie van betrokkenen |  | task_group |  | Copy from 6.1.1.1 |
| 7.1.1 |     Belang van betrokken partij en uitkomst consultatie van betrokkenen |  | open_text |  |  |
| 7.2 |   Aanvullende informatie over de belangen | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 8 | Verwerkingslocaties | Benoem in welke landen de gegevensverwerkingen plaatsvinden. Beschrijf het doorgiftemechanisme da... | task_group |  |  |
| 8.1 |   Gegevensverwerking, verwerkingslocatie, doorgiftemechanisme, maatregelen |  | task_group |  | Copy from 3.1.1 |
| 8.1.1 |     Verwerkingslocaties |  | task_group |  |  |
| 8.1.1.1 |       Verwerkingslocatie |  | text_input |  |  |
| 8.1.1.2 |       Doorgiftemechanisme |  | select_option | Adequaatheidsbesluit; Standaard contractsbepaling (SCC); binding corporate rules/bindend bedrijfsvoorschrift (bcr); Goedgekeurde certificeringsmechanisme; Goedgekeurde gedragscode; Juridisch bindend en afdwingbaar instrument; uitzondering artikel 49 avg; Overig mechanisme |  |
| 8.1.1.3 |       Maatregelen |  | text_input |  |  |
| 8.2 |   Aanvullende informatie over de verwerkingslocaties | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 9 | Juridisch en beleidsmatig kader | Benoem alle wet- en regelgeving en beleid met mogelijke gevolgen voor de gegevensverwerkingen. De... | task_group |  |  |
| 9.1 |   Gegevensverwerkingen, juridisch en/of beleidsmatigkader, Wetsartikelen |  | task_group |  | Copy from 3.1.1 |
| 9.1.1 |     Juridisch en beleidsmatig kader |  | task_group |  |  |
| 9.1.1.1 |       Juridisch en/of beleidsmatig kader |  | text_input |  |  |
| 9.1.1.2 |       Wetsartikelen |  | text_input |  |  |
| 9.2 |   Aanvullende informatie toe over het juridische en beleidsmatig kader | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 10 | Bewaartermijnen | Bepaal de bewaartermijnen van de persoonsgegevens aan de hand van de gegevensverwerkingen en de v... | task_group |  |  |
| 10.1 |   Gegevensverwerking, verwerkingsdoeleinde, categorie betrokkene & persoonsgegevens, bewaartermijn archiveringsperiode & motivatie bewaartermijn |  | task_group |  | Copy from 3.1.1 |
| 10.1.1 |     Bewaartermijnen |  | task_group |  |  |
| 10.1.1.1 |       Verwerkingsdoeleinde |  | display_text |  | Copy from 5.1.1 |
| 10.1.1.2 |       Categorie betrokkene |  | checkbox_option |  | Options from 2.1.2 |
| 10.1.1.3 |       Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 10.1.1.4 |       Bewaartermijn/archiveringsperiode |  | select_option | Aantal jaren; Jaar; Minder dan 1 maand; Minder dan 1 week; Minder dan 24 uur |  |
| 10.1.1.5 |       Motivatie bewaartermijn |  | open_text |  |  |
| 10.2 |   Aanvullende informatie over de bewaartermijnen | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 11 | Rechtsgrond | Bepaal op welke rechtsgronden de gegevensverwerkingen worden gebaseerd. Voeg de rechtsgronden voo... | task_group |  |  |
| 11.1 |   Gegevensverwerking, Rechtsgrond, toelichting op de rechtsgrond |  | task_group |  | Copy from 3.1.1 |
| 11.1.1 |     Rechtsgrond |  | task_group |  |  |
| 11.1.1.1 |       Rechtsgrond |  | select_option | Rechtsgrond toestemming; Rechtsgrond noodzakelijk voor de uitvoering van een overeenkoms; Rechtsgrond wettelijke verplichting; Rechtsgrond vitaal belang; Rechtsgrond taak van algemeen belang; Rechtsgrond gerechtvaardigd belang |  |
| 11.1.1.2 |       Toelichting op de rechtsgrond |  | open_text |  |  |
| 11.2 |   Aanvullende informatie over de rechtsgronden | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 12 | Bijzondere persoonsgegevens, strafrechtelijke persoonsgegevens en nationale identificatienummers | Het verwerken van bijzondere persoonsgegevens of strafrechtelijke persoonsgegevens is in principe... | task_group |  |  |
| 12.1 |   Bijzondere persoonsgegevens |  | task_group |  |  |
| 12.1.1 |     Bijzondere persoonsgegevens | Worden er bijzondere persoonsgegevens verwerkt? | radio_option | False; True |  |
| 12.1.2 |     Bijzondere persoonsgegevens |  | task_group |  | Show if 12.1.1 |
| 12.1.2.1 |       Gegevensverwerking |  | checkbox_option |  | Options from 3.1.1 |
| 12.1.2.2 |       Categorie betrokkene |  | checkbox_option |  | Options from 2.1.2 |
| 12.1.2.3 |       Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 12.1.2.4 |       Type bijzondere persoonsgegevens |  | select_option | Type bijzondere persoonsgegevens: Biometrische gegevens met het oog op de unieke identificatie van een persoon; Type bijzondere persoonsgegevens: Gegevens met betrekking tot iemands seksueel gedrag of seksuele gerichtheid; Type bijzondere persoonsgegevens: Gegevens over gezondheid; Type bijzondere persoonsgegevens: Genetische gegevens; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit het lidmaatschap van een vakbond blijkt; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit politieke opvattingen blijken; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit ras of etnische afkomst blijkt; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit religieuze of levensbeschouwelijke overtuigingen blijken |  |
| 12.1.2.5 |       Doorbrekingsgrond | Voor elke type bijzondere persoonsgegevens wordt een doorbrekingsgrond vastgelegd, en de wet- en regelgeving die de doorbrekingsgrond beschrijft. | open_text |  |  |
| 12.2 |   Strafrechtelijke persoonsgegevens |  | task_group |  |  |
| 12.2.1 |     Strafrechtelijke persoonsgegevens | Worden er strafrechtelijke persoonsgegevens verwerkt? | radio_option | False; True |  |
| 12.2.2 |     Strafrechtelijke persoonsgegevens |  | task_group |  | Show if 12.2.1 |
| 12.2.2.1 |       Gegevensverwerking |  | checkbox_option |  | Options from 3.1.1 |
| 12.2.2.2 |       Categorie betrokkene |  | checkbox_option |  | Options from 2.1.2 |
| 12.2.2.3 |       Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 12.2.2.4 |       Uitzonderingsgrond |  | open_text |  |  |
| 12.3 |   Nationale identificatienummers |  | task_group |  |  |
| 12.3.1 |     Nationale identificatienummers | Worden er nationale identificatienummers verwerkt? | radio_option | False; True |  |
| 12.3.2 |     Nationale identificatienummers |  | task_group |  | Show if 12.3.1 |
| 12.3.2.1 |       Gegevensverwerking |  | checkbox_option |  | Options from 3.1.1 |
| 12.3.2.2 |       Categorie betrokkene |  | checkbox_option |  | Options from 2.1.2 |
| 12.3.2.3 |       Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 12.3.2.4 |       Uitzonderingsgrond |  | open_text |  |  |
| 12.4 |   Aanvullende informatie over de bijzondere persoonsgegevens, strafrechtelijke persoonsgegevens en nationale identificatienummers | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 13 | Doelbinding | Als de persoonsgegevens voor een ander doeleinde worden verwerkt dan het doeleinde waarvoor de pe... | task_group |  |  |
| 13.1 |   Gegevensverwerking, categorie betrokkenen & persoonsgegevens, doeleinde & oorspronkelijk doeleinde |  | task_group |  | Copy from 3.1.1 |
| 13.1.1 |     Doelbinding |  | task_group |  |  |
| 13.1.1.1 |       Categorie betrokkene |  | checkbox_option |  | Options from 2.1.2 |
| 13.1.1.2 |       Persoonsgegevens |  | checkbox_option |  | Options from 2.1.1 |
| 13.1.1.3 |       Doeleinde |  | text_input |  |  |
| 13.1.1.4 |       Oorspronkelijk doeleinde |  | text_input |  |  |
| 13.1.1.5 |       Wat is de beoordeling van de verdere verwerking? |  | radio_option | Toelaatbaar op grond van Unie- of lidstaatrechtelijk recht; Verenigbaar met oorspronkelijk doeleinde; Niet van toepassing (geen verdere verwerking) |  |
| 13.1.1.6 |       Specificatie van het wetsartikel voor "Toelaatbaar op grond van Unie- of lidstaatrechtelijk recht" |  | open_text |  | Show if 13.1.1.5 |
| 13.2 |   Aanvullende informatie over de verenigbaarheid en toelaatbaarheid | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 14 | Noodzaak en evenredigheid | Beoordeel of de voorgenomen gegevensverwerkingen noodzakelijk en evenredig zijn voor het verwezen... | task_group |  |  |
| 14.1 |   De beoordeling van de subsidiariteit | Kunnen de verwerkingsdoeleinden in redelijkheid niet op een andere, voor de betrokkenen minder nadelige wijze, worden verwezenlijkt? | open_text |  |  |
| 14.2 |   De beoordeling van de proportionaliteit | Staat de inbreuk op de persoonlijke levenssfeer en de bescherming van de persoonsgegevens van de betrokkenen in evenredige verhouding tot de verwerkingsdoeleinden? | open_text |  |  |
| 15 | Rechten van de betrokkenen | Beschrijf de procedure waarmee invulling wordt gegeven aan de rechten van de betrokkenen. Als de ... | task_group |  |  |
| 15.1 |   Recht van inzage |  | task_group |  |  |
| 15.1.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.1.2 |     Toelichting op procedure ter invulling van het recht van de betrokkene |  | open_text |  | Show if 15.1.1 |
| 15.1.3 |     Beperking toelichting | Voeg hier de rechtsgrond voor beperking op recht van de betrokkene toe. | open_text |  | Show if 15.1.1 |
| 15.2 |   Recht op rectificatie en aanvulling |  | task_group |  |  |
| 15.2.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.2.2 |     Procedure toelichting |  | open_text |  | Show if 15.2.1 |
| 15.2.3 |     Beperking toelichting |  | open_text |  | Show if 15.2.1 |
| 15.3 |   Recht op vergetelheid |  | task_group |  |  |
| 15.3.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.3.2 |     Procedure toelichting |  | open_text |  | Show if 15.3.1 |
| 15.3.3 |     Beperking toelichting |  | open_text |  | Show if 15.3.1 |
| 15.4 |   Recht op beperking van de verwerking |  | task_group |  |  |
| 15.4.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.4.2 |     Procedure toelichting |  | open_text |  | Show if 15.4.1 |
| 15.4.3 |     Beperking toelichting |  | open_text |  | Show if 15.4.1 |
| 15.5 |   Recht op dataportabiliteit |  | task_group |  |  |
| 15.5.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.5.2 |     Procedure toelichting |  | open_text |  | Show if 15.5.1 |
| 15.5.3 |     Beperking toelichting |  | open_text |  | Show if 15.5.1 |
| 15.6 |   Recht niet onderworpen te worden aan uitsluitend geautomatiseerde besluitvorming |  | task_group |  |  |
| 15.6.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.6.2 |     Procedure toelichting |  | open_text |  | Show if 15.6.1 |
| 15.6.3 |     Beperking toelichting |  | open_text |  | Show if 15.6.1 |
| 15.7 |   Recht om bezwaar te maken |  | task_group |  |  |
| 15.7.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.7.2 |     Procedure toelichting |  | open_text |  | Show if 15.7.1 |
| 15.7.3 |     Beperking toelichting |  | open_text |  | Show if 15.7.1 |
| 15.8 |   Recht op duidelijke informatie |  | task_group |  |  |
| 15.8.1 |     Procedures ter uitvoering |  | radio_option | False; True |  |
| 15.8.2 |     Procedure toelichting |  | open_text |  | Show if 15.8.1 |
| 15.8.3 |     Beperking toelichting |  | open_text |  | Show if 15.8.1 |
| 16 | Risico’s voor betrokkenen | Beschrijf en beoordeel de risico’s van de gegevensverwerkingen voor de rechten en vrijheden van b... | task_group |  |  |
| 16.1 |   Risico's voor de betrokkenen |  | task_group |  |  |
| 16.1.1 |     Beschrijving van het risico |  | open_text |  |  |
| 16.1.2 |     Oorsprong |  | open_text |  |  |
| 16.1.3 |     Kans |  | select_option | laag; midden; hoog |  |
| 16.1.4 |     Motivatie van de kans |  | text_input |  |  |
| 16.1.5 |     Impact |  | select_option | laag; midden; hoog |  |
| 16.1.6 |     Motivatie van de impact |  | text_input |  |  |
| 16.1.7 |     Risiconiveau | Het risiconiveau wordt automatisch berekend op basis van de ingevoerde kans en impact. | select_option | laag; midden; hoog |  |
| 16.1.8 |     Motivatie van de risicoinschatting |  | text_input |  |  |
| 16.2 |   Aanvullende informatie over de risico’s | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 17 | Maatregelen | Beoordeel welke technische, organisatorische en juridische maatregelen in redelijkheid kunnen wor... | task_group |  |  |
| 17.1 |   Risico, Oorsprong, Maatregelen, Resterende risico en risico-inschatting & beheerder van maatregelen |  | task_group |  |  |
| 17.1.1 |     Risico |  | checkbox_option |  | Options from 16.1.1 |
| 17.1.2 |     Oorsprong |  | text_input |  |  |
| 17.1.3 |     Maatregelen |  | text_input |  |  |
| 17.1.4 |     Resterend risico en de risicoinschatting |  | select_option | laag; midden; hoog |  |
| 17.1.5 |     Voeg een verwijzing of beschrijving van het advies AP toe |  | open_text |  | Show if 17.1.4 |
| 17.1.6 |     In welk land vindt de monitoring en evaluatie van de maatregelen plaats? |  | text_input |  | Show if 17.1.4 |
| 17.1.7 |     Beheerder van de maatregelen |  | text_input |  |  |
| 17.2 |   Aanvullende informatie over de maatregelen | Gebruik dit optionele tekstveld voor extra toelichting op de ingevulde vragen. | open_text |  |  |
| 17.3 |   Onderbouwing acceptatie resterende risico's |  | open_text |  |  |
| 18 | Managementsamenvatting | Voeg hier de DPIA managementsamenvatting toe na afronding rapportagemodel. De managementsamenvatt... | open_text |  |  |
| 19 | Versie, Status, DPIA-dossier, Documentbeheerder en Advies FG |  | task_group |  |  |
| 19.1 |   Versie |  | task_group |  |  |
| 19.1.1 |     DPIA versie |  | text_input |  |  |
| 19.1.2 |     Datum |  | date |  |  |
| 19.1.3 |     Toelichting |  | text_input |  |  |
| 19.2 |   Status |  | select_option | concept; definitief |  |
| 19.3 |   DPIA dossier |  | task_group |  |  |
| 19.3.1 |     Grootte (aantal documenten) |  | text_input |  |  |
| 19.3.2 |     Documenten |  | task_group |  |  |
| 19.3.2.1 |       Document soort |  | text_input |  |  |
| 19.3.2.2 |       Document naam |  | text_input |  |  |
| 19.3.2.3 |       Document versie |  | text_input |  |  |
| 19.3.2.4 |       Document locatie |  | text_input |  |  |
| 19.4 |   Documentbeheerder |  | task_group |  |  |
| 19.4.1 |     Organisatie |  | text_input |  |  |
| 19.4.2 |     Directie |  | text_input |  |  |
| 19.4.3 |     Afdeling |  | text_input |  |  |
| 19.4.4 |     Naam |  | text_input |  |  |
| 19.4.5 |     Functie |  | text_input |  |  |
| 19.4.6 |     Opslaglocatie |  | text_input |  |  |
| 19.5 |   Advies functionaris voor gegevensbescherming (FG) |  | task_group |  |  |
| 19.5.1 |     Organisatie |  | text_input |  |  |
| 19.5.2 |     Directie |  | text_input |  |  |
| 19.5.3 |     Afdeling |  | text_input |  |  |
| 19.5.4 |     Naam |  | text_input |  |  |
| 19.5.5 |     Functie |  | text_input |  |  |
| 19.5.6 |     Datum advies |  | date |  |  |
| 19.5.7 |     Advies FG in document (naam document) |  | open_text |  |  |
| 19.5.8 |     Advies FG verwerkt in versie (versienummer) |  | checkbox_option |  | Options from 19.1.1 |
| 20 | Vaststelling en ondertekening |  | task_group |  |  |
| 20.1 |   Verwerkingsverantwoordelijke |  | task_group |  |  |
| 20.1.1 |     Organisatie |  | text_input |  |  |
| 20.1.2 |     Directie |  | text_input |  |  |
| 20.1.3 |     Afdeling |  | text_input |  |  |
| 20.1.4 |     Naam |  | text_input |  |  |
| 20.1.5 |     Functie |  | text_input |  |  |
| 20.1.6 |     Datum ondertekening | Om de DPIA formeel vast te stellen is het noodzakelijk deze te ondertekenen, zodat het duidelijk is dat de DPIA door de verwerkingsverantwoordelijke(n) akkoord is bevonden. | date |  |  |
| 20.1.7 |     Opgesteld door afdeling |  | text_input |  |  |
