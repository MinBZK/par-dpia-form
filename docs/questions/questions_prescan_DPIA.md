# Question Overview for Pre-scan DPIA

| Question ID | Question | Type | Options | Related Questions |
|------------|----------|------|---------|-------------------|
| 0 | Inleiding | task_group |  |  |
| 0.1 |   Scope | radio_option | True; False |  |
| 0.2 |   Beschrijving van de verwerking | open_text |  | prescanModelId: 1; DPIA: 1.1 |
| 0.3 |   Doel gegevensverwerking | open_text |  | prescanModelId: 2; DPIA: ['5.1', '10'] |
| 0.4 |   Wat is de grondslag voor de verwerking? | select_option | Toestemming betrokkene; Noodzakelijk voor overeenkomst; Wettelijke plicht; Vitaal belang; Taak van algemeen belang; Gerechtvaardigd belang | prescanModelId: 3; DPIA: 11.1.1 |
| 0.5 |   Cloudgebruik | task_group |  |  |
| 0.5.1 |     Is er sprake van cloudgebruik? | radio_option | True; False |  |
| 0.5.2 |     Selecteer een of meer van onderstaande opties | checkbox_option | Een Saas, IaaS of PaaS oplossing; Cloudopslag van data; Een applicatie die gebruik maakt van een subverwerker voor cloudopslag (bijv. Azure, AWS, Google Cloud); On premise toepassing met functionaliteiten van het internet vanuit de cloud (hybrid cloud) | Show if 0.5.1; prescanModelId: 4; DPIA: 4 |
| 0.5.3 |     Welke vorm van cloud betreft het? | radio_option | Public cloud; Private cloud; Hybrid | Show if 0.5.1; prescanModelId: 5; DPIA: 4 |
| 0.5.4 |     Gaat het om materieel public cloudgebruik voor de primaire taak? | radio_option | True; False | Show if 0.5.1; prescanModelId: 6; DPIA: 4 |
| 1 | Gegevensverwerking | task_group |  |  |
| 1.1 |   Gewone persoonsgegevens | task_group |  |  |
| 1.1.1 |     Gaat het systeem categorieën gewone persoonsgegevens verwerken? | radio_option | True; False | prescanModelId: 7 |
| 1.1.2 |     Gaat het systeem een van onderstaande gewone persoonsgegevens verwerken? Selecteer één of meer opties. | checkbox_option | Categorie gewone persoonsgegevens: Apparaat- en internetgegevens; Categorie gewone persoonsgegevens: Content; Categorie gewone persoonsgegevens: Demografische gegevens; Categorie gewone persoonsgegevens: Diagnostische gegevens of telemetrie; Categorie gewone persoonsgegevens: Gegevens verzameld via een website; Categorie gewone persoonsgegevens: Helpdeskgegevens; Categorie gewone persoonsgegevens: Logging; Categorie gewone persoonsgegevens: Naam, contactgegevens; Categorie gewone persoonsgegevens: Overige | Show if 1.1.1; prescanModelId: 7; DPIA: 2.1.3 |
| 1.1.3 |     Specificeer | open_text |  | Show if 1.1.2; DPIA: 2.1.3 |
| 1.2 |   Bijzondere persoonsgegevens | task_group |  |  |
| 1.2.1 |     Gaat het systeem bijzondere persoonsgegevens verwerken? | radio_option | True; False | prescanModelId: 8; DPIA: 12.1.1 |
| 1.2.2 |     Gaat het systeem een van onderstaande bijzondere persoonsgegevens verwerken? Selecteer één of meer opties. | checkbox_option | Type bijzondere persoonsgegevens: Biometrische gegevens met het oog op de unieke identificatie van een persoon; Type bijzondere persoonsgegevens: Gegevens met betrekking tot iemands seksueel gedrag of seksuele gerichtheid; Type bijzondere persoonsgegevens: Gegevens over gezondheid; Type bijzondere persoonsgegevens: Genetische gegevens; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit het lidmaatschap van een vakbond blijkt; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit politieke opvattingen blijken; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit ras of etnische afkomst blijkt; Type bijzondere persoonsgegevens: Persoonsgegevens waaruit religieuze of levensbeschouwelijke overtuigingen blijken | Show if 1.2.1; prescanModelId: 8; DPIA: ['2.1.3', '12.1.2.4'] |
| 1.3 |   Overige gevoelige persoonsgegevens | task_group |  |  |
| 1.3.1 |     Gaat het systeem ook andere gevoelige persoonsgegevens verwerken? | radio_option | True; False | prescanModelId: 9 |
| 1.3.2 |     Gaat het systeem een van onderstaande gevoelige persoonsgegevens verwerken? Selecteer één of meer opties. | checkbox_option | Categorie gevoelige persoonsgegevens: Surfgedrag; Categorie gevoelige persoonsgegevens: Gegevens over de financiële situatie van de betrokkene; Categorie gevoelige persoonsgegevens: Gegevens die kunnen worden gebruikt voor (identiteits)fraude; Categorie gevoelige persoonsgegevens: Gegevens die betrekking hebben op kwetsbare groepen; Categorie gevoelige persoonsgegevens: Gebruikersnamen, wachtwoorden en andere inloggegevens; Categorie gevoelige persoonsgegevens: Communicatie- en locatiegegevens; Categorie gevoelige persoonsgegevens: Nationale identificatienummers (bijv. BSN); Categorie gevoelige persoonsgegevens: Strafrechtelijke gegevens; Categorie gevoelige persoonsgegevens: Andere gegevens die kunnen leiden tot stigmatisering of uitsluiting van de betrokkene | Show if 1.3.1; prescanModelId: 9; DPIA: 2.1.3 |
| 1.4 |   Categorieën betrokkene | task_group |  |  |
| 1.4.1 |     Welke categorieën betrokkene kun je onderscheiden? | checkbox_option | Categorie betrokkenen: Medewerkers/bewindspersonen; Categorie betrokkenen: Burgers over wie gegevens worden verwerkt in het proces/systeem/applicatie; Categorie betrokkenen: Kinderen jonger dan 16 jaar; Categorie betrokkenen: Andere kwetsbare groepen (gehandicapten, minderheden, etc.); Categorie betrokkenen: Specificatie categorie betrokkenen (bijv. vanuit uitvoeringswetgeving) | prescanModelId: 10; DPIA: 2.1.2 |
| 1.4.2 |     Specificeer | open_text |  | Show if 1.4.1 |
| 1.5 |   Wat is naar schatting de omvang van de gegevensset/de verwerking? | task_group |  | prescanModelId: 11 |
| 1.5.1 |     Is het totale aantal betrokkenen gelijk aan of groter dan 10.000? | radio_option | True; False | prescanModelId: 11.a |
| 1.5.2 |     Is de hoeveelheid gegevens die wordt verwerkt van alle betrokkene gelijk aan of groter dan 10.000? | radio_option | True; False | prescanModelId: 11.b |
| 1.5.3 |     Frequentie van verwerking | select_option | Continu; Vaker dan maandelijks; Minstens maandelijks; Minstens jaarlijks; Onregelmatig; Eenmalig | prescanModelId: 11.c |
| 1.5.4 |     Wat is de bewaartermijn van de gegevens? | select_option | Aantal jaren; Jaar; Minder dan 1 maand; Minder dan 1 week; Minder dan 24 uur | prescanModelId: 11.c; DPIA: 10.1.1.4 |
| 2 | Internationale doorgiften | task_group |  |  |
| 2.1 |   Internationale doorgiften | task_group |  |  |
| 2.1.1 |     Is er sprake van internationale doorgifte buiten de Europese Economische Ruimte (EER)? | radio_option | True; False | prescanModelId: 13 |
| 2.1.2 |     Waar is het hoofdkantoor van de cloudprovider gevestigd? | radio_option | Binnen EER; Buiten EER | Show if 2.1.1; prescanModelId: 14; DPIA: 8.1.1 |
| 2.1.3 |     Waar vindt de opslag van de gegevens contractueel plaats? | radio_option | On premise; Datacenter EER; Buiten EER | Show if 2.1.1; prescanModelId: 15 |
| 2.1.4 |     Van waaruit wordt er support geleverd? | radio_option | Binnen EER; Buiten EER | Show if 2.1.1; prescanModelId: 16 |
| 2.1.5 |     Waar worden telemetrie en/of diagnostische gegevens verwerkt? | radio_option | Binnen EER; Buiten EER | Show if 2.1.1; prescanModelId: 17 |
| 2.1.6 |     Mechanisme(s) voor doorgifte | radio_option | Adequaatheidsbesluit; Standaard contractsbepaling (SCC); binding corporate rules/bindend bedrijfsvoorschrift (bcr); Goedgekeurde certificeringsmechanisme; Goedgekeurde gedragscode; Juridisch bindend en afdwingbaar instrument; uitzondering artikel 49 avg; Overig mechanisme | Show if 2.1.1; prescanModelId: 18 |
| 2.1.7 |     Specificatie overig doorgiftemechanisme | text_input |  | Show if 2.1.6; prescanModelId: 18 |
| 2.1.8 |     Bevat de doorgifte ook bijzondere persoonsgegevens? | radio_option | True; False | Show if 2.1.1; prescanModelId: 19 |
| 3 | Lijst AP | task_group |  |  |
| 3.1 |   Welke groepen betrokkenen kun je onderscheiden? | checkbox_option | Lijst AP: Biometrische gegevens; Lijst AP: Cameratoezicht; Lijst AP: Communicatiegegevens; Lijst AP: Controle werknemers; Lijst AP: Creditscores; Lijst AP: Financiële situatie; Lijst AP: Flexibel cameratoezicht; Lijst AP: Fraudebestrijding; Lijst AP: Genetische persoonsgegevens; Lijst AP: Gezondheidsgegevens; Lijst AP: Heimelijk onderzoek; Lijst AP: Internet of things; Lijst AP: Profilering; Lijst AP: Observatie en beïnvloeding van gedrag; Lijst AP: Locatiegegevens; Lijst AP: Samenwerkingsverbanden; Lijst AP: Zwarte lijsten | prescanModelId: D |
| 4 | Lijst EDPB | task_group |  |  |
| 4.1 |   Welke categorieën betrokkenen kun je onderscheiden? | checkbox_option | Lijst EDPB: Bijzondere persoonsgegevens of zeer gevoelige persoonsgegevens; Lijst EDPB: Blokkering van een dienst, recht of contract; Lijst EDPB: Geautomatiseerde besluitvorming; Lijst EDPB: Gebruik van nieuwe technologieën; Lijst EDPB: Grootschalige gegevensverwerkingen; Lijst EDPB: Koppelen van datasets; Lijst EDPB: Mensen beoordelen met persoonskenmerken (evaluatie of scoring); Lijst EDPB: Stelselmatige en grootschalige monitoring; Lijst EDPB: Verwerking van persoonsgegevens over kwetsbare groepen of personen | prescanModelId: E |
| 5 | Basisregistratie | task_group |  | prescanModelId: F |
| 5.1 |   Basisregistraties | task_group |  |  |
| 5.1.1 |     Betreft het een basisregistratie? | radio_option | True; False |  |
| 5.1.2 |     Van welke basisregistraties wordt gebruik gemaakt? | checkbox_option | Basisregistratie: Basisregistratie Grootschalige Topografie (BGT); Basisregistratie: Basisregistratie Inkomen (BRI); Basisregistratie: Basisregistratie Kadaster (BRK); Basisregistratie: Basisregistratie Ondergrond (BRO); Basisregistratie: Basisregistratie Personen (BRP); Basisregistratie: Basisregistratie Topografie (BRT); Basisregistratie: Basisregistratie Voertuigen (BRV); Basisregistratie: Basisregistratie Waarde Onroerende Zaken (WOZ); Basisregistratie: Handelsregister (HR); Basisregistratie: Basisregistratie Adressen en Gebouwen (BAG) | Show if 5.1.1; prescanModelId: F |
| 6 | Algoritmes/AI | task_group |  |  |
| 6.1 |   Algoritmes en AI | task_group |  |  |
| 6.1.1 |     Wordt er gebruik gemaakt van een algoritme? | radio_option | True; False | prescanModelId: G; DPIA: 4 |
| 6.1.2 |     Kwalificeert het algoritme als (een onderdeel van) een ‘hoog-risico AI-systeem’ volgens de EU AI-verordening? | radio_option | True; False | Show if 6.1.1 |
| 7 | Kinderrechten | task_group |  |  |
| 7.1 |   Kinderrechten | task_group |  |  |
| 7.1.1 |     Biedt u een digitale dienst aan of gebruikt u deze? | radio_option | True; False |  |
| 7.1.2 |     Biedt u een digitale dienst aan die primair bedoeld is voor gebruik door personen jonger dan 18 jaar? | radio_option | True; False | Show if 7.1.1 |
| 7.1.3 |     Kunt u aantonen dat de dienst niet zal worden gebruikt door personen jonger dan 18 jaar of deze niet wordt ingezet bij personen jonger dan 18 jaar? | radio_option | True; False | Show if 7.1.1 |
