# 0012: Overlap IAMA en DPIA, en koppelingen tussen assessments

Datum: 2026-10-29

## Status

Voorgesteld

## Besluit

1. De invulhulp volgt de handreiking *Gezamenlijk gebruik IAMA en Model DPIA Rijksdienst* (versie 3.2). Waar IAMA en DPIA volgens hoofdstuk 3 van de handreiking overlappen, toont het ene formulier per hoofdstuk de antwoorden uit het andere, in beide richtingen. Dit is naslag: er wordt niets overgeschreven.
2. Assessments in een project zijn aan elkaar te koppelen. Dat kan bij de start van een IAMA (kies een DPIA), bij de start van een DPIA (kies of importeer een pre-scan) of later via **Koppelen aan…**. De koppeling staat op de server, in een eigen tabel.
3. Een DPIA die vanuit een pre-scan wordt gestart, is daar voortaan aan gekoppeld. De antwoorden worden niet meer eenmalig gekopieerd. Latere wijzigingen in de pre-scan komen in de DPIA terug.
4. In het formulier zonder account tonen de DPIA en het IAMA in dezelfde browser elkaars antwoorden. De pre-scan wordt daar niet automatisch gekoppeld.
5. Waar de handreiking een andere nummering gebruikt dan de invulhulp, vertalen we die naar de invulhulp. Onduidelijkheden in de handreiking leggen we voor aan de opstellers.

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

DPIA-vraag 7 (belangen), 8 (verwerkingslocaties) en 10 (bewaartermijnen) hebben volgens de handreiking geen tegenhanger in het IAMA en zijn niet gekoppeld.

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
- Handreiking: bij het verwerken vielen 13 punten op, zoals nummering, koppelingen waar tabel en toelichting iets anders zeggen, verwijzingen en versie. Die staan in `docs/handreiking-iama-dpia-vragen.md` en leggen we voor aan CIO Rijk.

## Alternatieven

1. **Antwoorden tussen DPIA en IAMA overnemen in plaats van tonen.** Niet gekozen: beide formulieren hebben een eigen verantwoordelijke en een eigen vraagstelling. Overschrijven zou antwoorden laten verdwijnen die de invuller bewust anders heeft geformuleerd.
2. **De pre-scan blijven kopiëren bij de start van de DPIA.** Niet gekozen: de kopie verouderde zodra de pre-scan werd aangepast, en de herkomst was niet te zien.
3. **De koppeling opslaan in de state van het assessment** (eerst `_linkedDpiaId`, daarna `_linkedAssessmentIds`). Niet gekozen: de server kon niet controleren of een koppeling geldig was, en voor de andere richting moest elk assessment in het project worden gelezen. Een eigen tabel maakt beide richtingen in één query mogelijk en laat de server ongeldige koppelingen weigeren.
4. **Alles in een project automatisch koppelen.** Niet gekozen: een project kan meerdere DPIA's of IAMA's bevatten, en dan is niet te bepalen welke bij elkaar horen.

## Open punten

- De punten uit `docs/handreiking-iama-dpia-vragen.md` liggen nog bij CIO Rijk.
- De gebruiker ziet op de projectpagina niet welke assessments antwoorden van elkaar overnemen, en in welke richting. Een vervolgvoorstel is "vakken per onderwerp": een vak per verwerking of algoritme, met vaste plekken voor pre-scan, DPIA en IAMA. Assessments in hetzelfde vak zijn gekoppeld. Dit bouwen we op de NLDD-basis van #537 en #600, niet eerst in de huidige componenten.
