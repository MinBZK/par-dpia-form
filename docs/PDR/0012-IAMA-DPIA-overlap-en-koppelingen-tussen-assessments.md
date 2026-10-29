# 0012: Overlap IAMA en DPIA, en koppelingen tussen assessments

Datum: 2026-10-29

## Status

Voorgesteld

## Besluit

1. De invulhulp volgt de handreiking *Gezamenlijk gebruik IAMA en Model DPIA Rijksdienst* (versie 3.2). Waar IAMA en DPIA volgens hoofdstuk 3 van de handreiking overlappen, toont het ene formulier per hoofdstuk de antwoorden uit het andere, in beide richtingen. Dit is naslag: er wordt niets overgeschreven.
2. Assessments in een project zijn aan elkaar te koppelen. Dat kan bij de start van een IAMA (kies een DPIA), bij de start van een DPIA (kies of importeer een pre-scan) of later via **Koppelen aan…**. De koppeling staat op de server, in een eigen tabel.
3. Een DPIA die vanuit een pre-scan wordt gestart, is daar voortaan aan gekoppeld. De antwoorden worden niet meer eenmalig gekopieerd. Latere wijzigingen in de pre-scan komen in de DPIA terug.
4. In het formulier zonder account tonen de DPIA en het IAMA in dezelfde browser elkaars antwoorden. De pre-scan wordt daar niet automatisch gekoppeld.
5. Waar de handreiking een andere nummering gebruikt dan de invulhulp, vertalen we die naar de invulhulp. Waar tabel en toelichting van de handreiking verschillen, volgen we de toelichting als die een koppeling noemt: een extra koppeling is alleen naslag en overschrijft niets. De overige onduidelijkheden leggen we voor aan de opstellers (zie "Punten bij de handreiking").

## Achtergrond

CIO Rijk heeft met de handreiking vastgelegd welke vragen van het IAMA en het Model DPIA Rijksdienst over hetzelfde gaan. Wie voor één algoritme zowel een DPIA als een IAMA invult, beantwoordt die vragen anders twee keer, met het risico dat de antwoorden uit elkaar lopen.

Tot nu toe kende de invulhulp alleen een overname van pre-scan naar DPIA. Die werd bij de start van de DPIA eenmalig gekopieerd (`_prescanAnswers`). Een latere wijziging in de pre-scan kwam niet meer in de DPIA terecht, en de gebruiker kon niet zien uit welke pre-scan de antwoorden kwamen. Tussen DPIA en IAMA bestond geen verbinding.

## Overweging

- De handreiking is leidend voor welke vragen overlappen. De invulhulp voegt geen eigen koppelingen toe.
- Een bron mag de eigen antwoorden van een formulier nooit overschrijven. Tussen DPIA en IAMA is de overname daarom alleen naslag. De pre-scan vult de DPIA vooraf in, maar alleen velden die in de DPIA nog leeg zijn.
- Een koppeling moet controleerbaar zijn: het mag alleen gaan om assessments uit hetzelfde project, en niet om een assessment met zichzelf.
- Wie een assessment mag lezen, mag zien waaraan het gekoppeld is. Alleen wie mag bewerken, mag koppelingen wijzigen.
- Bestaande DPIA's moeten blijven werken zoals ze werkten.

## Details

**Bronnen.** De koppelingen uit hoofdstuk 3 van de handreiking staan als `pre-view`-verwijzingen in `sources/dpia.yaml` en `sources/iama.yaml`, in beide richtingen. Groepsvragen verwijzen via hun invulvelden. Vertaalde nummers:

| Handreiking | Invulhulp | Reden |
|---|---|---|
| IAMA 5A | 5.A.6 (Noodzakelijkheid van de inzet) | deel 5 heeft meerdere vragen onder A |
| IAMA 5(C) | 5.C (Restrisico's en acceptatie) | schrijfwijze |
| IAMA 4.1.2 (verfijning) | 4.1.3 | 4.1.1 is in de invulhulp gesplitst ([PDR 0009](0009-IAMA-afwijkingen-invulhulp-ten-opzichte-van-iama-v2.md)) |

DPIA-vraag 10 (bewaartermijnen) heeft volgens de handreiking geen tegenhanger in het IAMA en is niet gekoppeld. Vraag 7 (belangen) en 8 (verwerkingslocaties) staan in de tabel van de handreiking als "NVT", maar de toelichting noemt wel IAMA-vragen. Die zijn gekoppeld (punt 6 en 7 hieronder).

**Weergave.** Per hoofdstuk toont een blok de antwoorden uit het gekoppelde formulier, met de bron erbij (pre-scan, DPIA of IAMA). Bij herhaalbare vragen staan alle ingevulde antwoorden erin, bijvoorbeeld alle doeleinden. De component heet `LinkedFormPreview` (voorheen `PreScanPreview`).

**Koppelingen in een project.** Tabel `assessment_links` (van, naar; cascade bij verwijderen; index op naar), migratie `0004`:
- `GET /api/v1/assessments/:id/links` geeft beide richtingen in één query, nieuwst gewijzigd eerst. Minimaal de rol lezer.
- `PUT /api/v1/assessments/:id/links` vervangt de uitgaande koppelingen in één transactie. Minimaal de rol bewerker. Een koppeling naar zichzelf, naar een ander project of naar een onbekend assessment geeft 400 en wijzigt niets.

Bij het openen laadt de editor per formuliertype het laatst bijgewerkte gekoppelde assessment, en alleen een ander type dan het open formulier. Bronnen worden alleen toegepast als de editor nog bij hetzelfde assessment is.

**Pre-scan en DPIA.** Een geïmporteerd pre-scan-bestand wordt eerst een pre-scan in het project en daarna gekoppeld. Bestaande DPIA's houden hun gekopieerde `_prescanAnswers` als terugval.

**Formulier zonder account.** De DPIA en het IAMA lezen elkaars antwoorden uit de browseropslag. De pre-scan wordt niet automatisch gekoppeld, omdat die DPIA-velden vooraf invult en een gebruiker dat dan niet zelf heeft gekozen. Wie de pre-scan wil meenemen, laadt het bestand in bij de start van de DPIA (zie [PDR 0011](0011-DPIA-PreScan-aanpassingen-backlog-informatiemodel-en-invulhulpen.md)).

## Impact

- Gebruikers: wie DPIA en IAMA voor hetzelfde algoritme invult, ziet per hoofdstuk wat al in het andere formulier staat. Een DPIA volgt wijzigingen in de gekoppelde pre-scan.
- Gedragswijziging: een DPIA uit een pre-scan kopieert niet meer eenmalig, maar blijft gekoppeld. Velden die de pre-scan vooraf invult, worden alleen gevuld zolang ze in de DPIA nog leeg zijn.
- Datamodel: nieuwe tabel `assessment_links` met migratie `0004`. De state van een assessment verandert niet.
- Beperkingen: de weergave staat per hoofdstuk, niet per vraag. De antwoorden per recht uit DPIA-hoofdstuk 15 (rechten van betrokkenen) worden niet in het IAMA getoond. Een koppeling wordt niet als versie in de versiegeschiedenis vastgelegd.
- Handreiking: bij het verwerken vielen 13 punten op. Drie zijn uitgevoerd, vier hebben we ingevuld ter bevestiging, en zes zijn een vraag of verzoek aan de opstellers (zie hieronder).

## Punten bij de handreiking

Bij het verwerken van de handreiking (versie 3.2, schoon) vielen 13 punten op. Dit hoofdstuk is bedoeld om voor te leggen aan de opstellers bij CIO Rijk. Per punt staat de status:

- **Uitgevoerd:** de invulhulp is aangepast; graag bevestigen dat dit de bedoeling is.
- **Ingevuld:** de invulhulp maakt een keuze; graag bevestigen.
- **Ter informatie:** geen vraag.
- **Verzoek:** een aanpassing in de handreiking zelf.

### Nummering

**1. IAMA "5A" en "5(C)". Ingevuld.**
De handreiking koppelt DPIA-vraag 14 aan IAMA-vraag "5A" ("Hoe noodzakelijk is het om dit algoritme in te zetten om deze belangen te dienen?") en DPIA-vraag 17 aan "5(C)". Deel 5 van het IAMA heeft meerdere vragen onder A.
De invulhulp koppelt 5A aan 5.A.6 (Noodzakelijkheid van de inzet), omdat de geciteerde vraagtekst die vraag is, en 5(C) aan 5.C (Restrisico's en acceptatie).
*Vraag:* klopt het dat met 5A alleen de vraag naar de noodzakelijkheid is bedoeld, en niet de hele belangenafweging onder A?

**2. IAMA 4.1.2 "Verfijning". Ter informatie.**
De handreiking volgt de nummering van het IAMA v2-document: 4.1.1 is de brainstorm, 4.1.2 de verfijning. In de invulhulp is 4.1.1 gesplitst in aangetaste grondrechten (4.1.1) en beschermde grondrechten (4.1.2). De verfijning heeft daardoor nummer 4.1.3 ([PDR 0009](0009-IAMA-afwijkingen-invulhulp-ten-opzichte-van-iama-v2.md)). DPIA-vraag 16 is gekoppeld aan 4.1.1, 4.1.2 en 4.1.3.

**3. De wettelijke grondslag bij IAMA 1.3.2. Ingevuld.**
De handreiking citeert 1.3.2 als "Wordt het algoritme gebruikt om een wettelijke taak uit te voeren? Zo ja, wat is de wettelijke grondslag?". In de invulhulp is de vraag naar de grondslag een aparte vraag 1.3.4. De koppeling met DPIA-vraag 9, 11 en 12 geldt daarom voor 1.3.2 en 1.3.4 samen, zodat de grondslag niet wegvalt.
*Vraag:* is de vraag naar de grondslag inderdaad bedoeld als onderdeel van deze koppeling?

**4. Verwijzing in de vraagtekst van IAMA 4.5.4. Verzoek.**
De handreiking citeert 4.5.4 met een verwijzing naar "vraag 4.5.1-4.5.4", dus ook naar zichzelf. De invulhulp verwijst naar 4.5.1–4.5.3.
*Verzoek:* de verwijzing aanpassen naar 4.5.1–4.5.3.

**5. Verwijzing naar publieke waarden bij IAMA 3.5.3. Verzoek.**
In de tabel "Inzet en toepassing van het algoritme" verwijst 3.5.3 (positieve effecten) naar "de gediende publieke waarden (1.2.2)". Vraag 1.2.1 gaat over de positief geraakte publieke waarden, 1.2.2 over de negatief geraakte. Deze omwisseling staat ook in het IAMA v2-document en is in de invulhulp rechtgezet (PDR 0009). In dezelfde rij ontbreekt de aanduiding "IAMA" in de eerste kolom.
*Verzoek:* de verwijzing aanpassen naar 1.2.1 en de kolom aanvullen.

### Koppelingen

**6. Belangen (DPIA-vraag 7) en publieke waarden. Uitgevoerd.**
De tabel bij DPIA-vraag 7 vermeldt "NVT" voor het IAMA, maar de toelichting zegt: "Als er al een DPIA is uitgevoerd, kan het antwoord op deze vraag mogelijk deels gebruikt worden bij vraag 1.2.1 en 1.2.2 van het IAMA." De tabel "Publieke waarden" vermeldt bij de DPIA "NVT".
De invulhulp volgt de toelichting: DPIA-vraag 7 (7.1.1) is gekoppeld aan IAMA 1.2.1 en 1.2.2, in beide richtingen.
*Vraag:* kunnen beide tabellen worden aangevuld? En de toelichting noemt "vraag 6 Model DPIA Rijksdienst"; vraag 6 gaat over betrokken partijen, de belangen staan in vraag 7. Is vraag 7 bedoeld?

**7. Verwerkingslocaties (DPIA-vraag 8) en de exitstrategie. Uitgevoerd.**
De tabel bij DPIA-vraag 8 vermeldt "NVT" voor het IAMA. De toelichting zegt dat IAMA-vraag 1.4.3 (exitstrategie) "met name relevant [kan] zijn wanneer externe partijen worden ingezet" en bij deze vraag kan worden betrokken. In hoofdstuk 3 is 1.4.3 alleen gekoppeld aan DPIA-vraag 17.
De invulhulp volgt de toelichting: IAMA 1.4.3 is ook gekoppeld aan DPIA-vraag 8 (8.2, aanvullende informatie over de verwerkingslocaties), in beide richtingen.
*Vraag:* kan de tabel bij vraag 8 worden aangevuld?

**8. IAMA 4.2.2 bij het juridisch kader (DPIA-vraag 9). Uitgevoerd.**
De toelichting bij DPIA-vraag 9 zegt: "Vraag 4.2.2 van het IAMA ziet specifiek op het gebruik van persoonsgegevens en de eventuele verplichting tot het uitvoeren van een DPIA." In de tabel staat 4.2.2 alleen bij DPIA-vraag 2.
De invulhulp volgt de toelichting: IAMA 4.2.2 is ook gekoppeld aan DPIA-vraag 9 (9.1.1.1), in beide richtingen.
*Vraag:* kan de tabel bij vraag 9 worden aangevuld?

**9. IAMA 2.5.3 bij twee DPIA-vragen. Ingevuld.**
IAMA 2.5.3 (toegang tot de data) staat bij DPIA-vraag 6 en bij DPIA-vraag 17, met een licht verschillende vraagtekst: de eerste keer eindigt die op "en leg uit", de tweede keer niet.
De invulhulp koppelt 2.5.3 aan beide vragen, omdat toegang tot de data zowel de betrokken partijen (6) als de maatregelen (17) raakt. De vraagtekst komt in de invulhulp uit het IAMA zelf, dus het verschil in de handreiking heeft daar geen gevolg.
*Verzoek:* de vraagtekst in de handreiking gelijk maken.

### Versie en verwijzingen in de tekst

**10. Versie van de handreiking en van het Model DPIA Rijksdienst. Verzoek.**
De bestandsnaam noemt versie 3.2, de samenvatting spreekt van "deze 3.0 versie". Paragraaf 2.1 noemt een herziening van het Model DPIA Rijksdienst uit 2023 en een tekstuele herziening van de toelichting in 2025 (versie 3.1). De invulhulp verwijst naar het Model DPIA Rijksdienst van augustus 2026.
*Vraag:* welke versie van de handreiking is de actuele, en op welke versie van het Model DPIA Rijksdienst is zij gebaseerd?

**11. Verwijzing naar paragrafen in de inleiding. Verzoek.**
Paragraaf 1.3 zegt dat paragraaf 2.3 de verschillen en overeenkomsten beschrijft. Die staan in paragraaf 2.4; paragraaf 2.3 gaat over het gecombineerd gebruik.
*Verzoek:* de verwijzing aanpassen naar 2.4.

**12. Benaming van het identificatienummer. Ingevuld.**
Bij DPIA-vraag 2 spreekt de handreiking van het "wettelijk identificatienummer". De invulhulp gebruikt "nationaal identificatienummer", de term uit artikel 87 AVG.
*Verzoek:* in de handreiking "nationaal identificatienummer" gebruiken.

**13. Opmaak. Verzoek.**
- De tabel "Bewaartermijnen" laat de kolom met het IAMA-vraagnummer leeg; elders staat "NVT".
- De tabel "Noodzaak en evenredigheid" heeft een vierde kolom waarin de tekst van de derde kolom herhaald wordt.

## Alternatieven

1. **Antwoorden tussen DPIA en IAMA overnemen in plaats van tonen.** Niet gekozen: beide formulieren hebben een eigen verantwoordelijke en een eigen vraagstelling. Overschrijven zou antwoorden laten verdwijnen die de invuller bewust anders heeft geformuleerd.
2. **De pre-scan blijven kopiëren bij de start van de DPIA.** Niet gekozen: de kopie verouderde zodra de pre-scan werd aangepast, en de herkomst was niet te zien.
3. **De koppeling opslaan in de state van het assessment** (eerst `_linkedDpiaId`, daarna `_linkedAssessmentIds`). Niet gekozen: de server kon niet controleren of een koppeling geldig was, en voor de andere richting moest elk assessment in het project worden gelezen. Een eigen tabel maakt beide richtingen in één query mogelijk en laat de server ongeldige koppelingen weigeren.
4. **Alles in een project automatisch koppelen.** Niet gekozen: een project kan meerdere DPIA's of IAMA's bevatten, en dan is niet te bepalen welke bij elkaar horen.

## Open punten

- De punten onder "Punten bij de handreiking" liggen bij CIO Rijk.
- De gebruiker ziet op de projectpagina niet welke assessments antwoorden van elkaar overnemen, en in welke richting. Een vervolgvoorstel is "vakken per onderwerp": een vak per verwerking of algoritme, met vaste plekken voor pre-scan, DPIA en IAMA. Assessments in hetzelfde vak zijn gekoppeld. Dit bouwen we op de NLDD-basis van #537 en #600, niet eerst in de huidige componenten.
