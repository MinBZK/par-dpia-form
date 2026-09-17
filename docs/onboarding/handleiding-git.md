# Handleiding: git in deze repository

Voor wie git nog weinig heeft gebruikt. Hier staat wat je in deze repository
nodig hebt, in de volgorde waarin je het tegenkomt. Het project zelf, de
assessments en de pijplijn eromheen, staat in
[`handleiding-project.md`](handleiding-project.md).

## Inhoud

- [Deel 1: Vier begrippen](#deel-1-vier-begrippen)
- [Deel 2: Eenmalig instellen](#deel-2-eenmalig-instellen)
- [Deel 3: De cyclus die je steeds herhaalt](#deel-3-de-cyclus-die-je-steeds-herhaalt)
- [Deel 4: Branches](#deel-4-branches)
- [Deel 5: Een pull request](#deel-5-een-pull-request)
- [Deel 6: Als er iets misgaat](#deel-6-als-er-iets-misgaat)
- [Deel 7: Twee commando's die werk kunnen wissen](#deel-7-twee-commandos-die-werk-kunnen-wissen)
- [Deel 8: Commits ondertekenen met je SSH-sleutel](#deel-8-commits-ondertekenen-met-je-ssh-sleutel)
- [Bijlage: spiekbriefje](#bijlage-spiekbriefje)

---

## Deel 1: Vier begrippen

**Repository.** De projectmap, plus de volledige geschiedenis ervan in de
verborgen map `.git`. Die geschiedenis is geen back-up van losse bestanden maar
een keten van momentopnamen.

**Commit.** Eén momentopname: welke bestanden er waren en wat erin stond, met
een bericht en een auteur erbij. Elke commit heeft een hash, zoals `bdaa16e`,
waarmee je hem terugvindt.

**Branch.** Een verplaatsbare verwijzing naar de laatste commit van één lijn
werk. Een branch is geen kopie van de bestanden; het is een etiket dat
meeschuift zodra je een commit maakt. Daarom kost een branch aanmaken niets.

**Remote.** De kopie op GitHub, die `origin` heet. Jouw map en `origin` zijn
twee aparte kopieën. `push` stuurt commits naar `origin`, `pull` haalt ze op.
Zolang je niet pusht, ziet niemand anders je werk.

Zo staan de branches in deze repository ten opzichte van elkaar:

```
main             o---o---o                     beschermd, alleen via een PR
                      \
add_aiia               o---o---o---o           hier werk je vanaf
                            \     /
aiia/hoofdstuk-4             o---o             jouw eigen branch
```

---

## Deel 2: Eenmalig instellen

```bash
git config --global user.name "Voornaam Achternaam"
git config --global user.email "jouw@adres.nl"   # het adres van je GitHub-account
gh auth login                                    # inloggen bij GitHub
```

Klopt het e-mailadres niet met je GitHub-account, dan verschijnen je commits
zonder je naam erbij.

Daarna de repository ophalen:

```bash
git clone https://github.com/MinBZK/par-dpia-form.git
cd par-dpia-form
git checkout add_aiia
```

**Let op bij je eerste commit.** In deze repository draaien er controles op het
moment dat je committeert: witruimte aan het eind van regels, geldige YAML en
JSON, en een zoektocht naar sleutels en wachtwoorden. Slaagt er één niet, dan
komt de commit er niet. Lees de melding, herstel wat er staat, `git add` het
bestand opnieuw en committeer nog een keer. Sommige controles passen het bestand
zelf aan; dan hoef je alleen `git add` en `git commit` te herhalen.

---

## Deel 3: De cyclus die je steeds herhaalt

```
bewerken  →  git status  →  git add <bestand>  →  git commit -m "..."  →  git push
```

**`git status`** is het commando dat je het vaakst gebruikt. Het zegt op welke
branch je zit, welke bestanden je hebt gewijzigd, en wat er klaarstaat voor de
volgende commit.

**`git diff`** toont de wijzigingen die nog niet klaarstaan, **`git diff
--staged`** die wel.

**`git add <pad>`** zet een bestand klaar. Doe dat per bestand. `git add .` pakt
alles, ook bestanden die je niet bedoelde mee te nemen.

**`git commit -m "..."`** legt vast wat klaarstaat. Het formaat van het bericht
staat in [`handleiding-project.md`](handleiding-project.md) onder "Commits".

**`git push`** stuurt je commits naar GitHub. De eerste keer op een nieuwe
branch:

```bash
git push -u origin aiia/hoofdstuk-4-technische-robuustheid
```

Daarna volstaat `git push`.

In één zin: `add` bepaalt wat er in de volgende commit komt, `commit` legt het
vast in je eigen kopie, `push` brengt het naar GitHub.

---

## Deel 4: Branches

`main` is beschermd en gaat alleen via een pull request met review. `add_aiia`
is de branch waar het AIIA-werk op staat; daar mag je rechtstreeks naartoe
pushen. Voor werk dat je apart wilt houden, maak je een eigen branch.

```bash
git checkout add_aiia
git pull                                        # haal op wat anderen hebben gepusht
git checkout -b aiia/hoofdstuk-4-technische-robuustheid
# bewerken, git add, git commit
git push -u origin aiia/hoofdstuk-4-technische-robuustheid
```

Naamgeving: `aiia/<waar-het-over-gaat>`, kort en beschrijvend.

Wisselen en kijken waar je bent:

```bash
git branch --show-current     # op welke branch zit ik?
git branch                    # welke branches heb ik lokaal?
git switch add_aiia           # naar een bestaande branch
git switch -                  # terug naar de vorige
```

Is `add_aiia` intussen opgeschoven en wil je dat in je eigen branch hebben:

```bash
git checkout add_aiia
git pull
git switch -                  # terug naar je eigen branch
git merge add_aiia
```

Werk je rechtstreeks op `add_aiia`, doe dan altijd eerst `git pull`. Anders
weigert `git push` omdat er op GitHub commits staan die jij nog niet hebt.

---

## Deel 5: Een pull request

Een pull request is een voorstel om de commits van jouw branch in een andere
branch op te nemen, met een plek voor commentaar erbij.

```bash
gh pr create --base add_aiia --title "..." --body "..."
gh pr view --web              # open hem in de browser
gh pr checks                  # draaien de controles, en slagen ze?
```

Push je daarna nog een commit naar dezelfde branch, dan werkt de pull request
zichzelf bij. Een tweede pull request openen is niet nodig. Wat er in de
omschrijving hoort, staat in
[`handleiding-project.md`](handleiding-project.md) onder "Pull requests".

---

## Deel 6: Als er iets misgaat

| Melding | Wat het betekent | Wat je doet |
|---|---|---|
| `Updates were rejected because the remote contains work that you do not have locally` | Op GitHub staan commits die jij niet hebt | `git pull`, daarna opnieuw `git push` |
| `CONFLICT (content): Merge conflict in <bestand>` | Dezelfde regels zijn aan twee kanten gewijzigd | Zie hieronder |
| `nothing to commit, working tree clean` | Er is niets gewijzigd, of alles staat al vast | Niets aan de hand |
| `Your branch is ahead of 'origin/add_aiia' by 2 commits` | Je hebt lokaal vastgelegd maar nog niet gepusht | `git push` |
| `You are in 'detached HEAD' state` | Je zit op een losse commit, niet op een branch | `git switch -` |
| `error: Your local changes would be overwritten by checkout` | Je hebt onopgeslagen werk dat in de weg zit | Eerst committen, of `git stash` |

**Een conflict oplossen.** Git zet beide versies in het bestand:

```
<<<<<<< HEAD
de regel zoals jij hem hebt
=======
de regel zoals hij op de andere branch staat
>>>>>>> add_aiia
```

Open het bestand, laat staan wat er moet komen (soms een combinatie van beide),
en haal de drie markeringsregels weg. Daarna:

```bash
git add <bestand>
git commit
```

Wil je terug naar de situatie van vóór de merge: `git merge --abort`.

**Iets terugdraaien.**

| Wat je wilt | Commando |
|---|---|
| Wijziging in een bestand weggooien | `git restore <pad>` |
| Uit de staging halen, wijziging behouden | `git restore --staged <pad>` |
| Laatste commit terugdraaien, wijzigingen behouden | `git reset --soft HEAD~1` |
| Laatste commitbericht aanpassen | `git commit --amend` (alleen als je nog niet gepusht hebt) |
| Op de verkeerde branch gecommit | `git reset --soft HEAD~1`, `git stash`, `git switch <juiste branch>`, `git stash pop` |
| Kwijtgeraakt waar je was | `git reflog` toont waar `HEAD` is geweest, `git checkout <hash>` brengt je erheen |

Wat vastligt in een commit, is bijna altijd terug te halen. `git reflog` is
daarvoor het eerste dat je probeert.

---

## Deel 7: Twee commando's die werk kunnen wissen

**`git push --force`** vervangt op GitHub wat daar staat door wat jij hebt. Op
een gedeelde branch als `add_aiia` is het werk van iemand anders daarmee weg.
Moet het toch, gebruik dan `git push --force-with-lease`: dat weigert zodra er
iets staat wat je nog niet hebt gezien.

**`git restore .`** gooit alle wijzigingen weg die je nog niet hebt vastgelegd.
Die staan nergens anders, dus daar helpt `git reflog` niet bij.

---

## Deel 8: Commits ondertekenen met je SSH-sleutel

Deze repository verplicht het niet: de ruleset van `main` staat ondertekening
niet als eis, en een commit zonder handtekening wordt gewoon aangenomen. Wil je
het toch, dan kan het met de SSH-sleutel die je al voor GitHub gebruikt. Een
ondertekende commit krijgt op GitHub het label "Verified", waarmee zichtbaar is
dat de commit van jouw sleutel komt en onderweg niet is aangepast.

Instellen:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true          # onderteken elke commit
```

De sleutel moet daarna als **signing key** bij je GitHub-account staan. Dat is
een aparte soort dan de authenticatiesleutel waarmee je pusht; dezelfde sleutel
mag voor allebei worden toegevoegd.

```bash
gh ssh-key add ~/.ssh/id_ed25519.pub --type signing --title "laptop"
```

Zonder die stap klopt de handtekening wel, maar weet GitHub niet van wie hij is
en blijft het label uit.

Lokaal controleren kan pas als je git vertelt welke sleutels je vertrouwt:

```bash
mkdir -p ~/.config/git
echo "jouw@adres.nl $(cat ~/.ssh/id_ed25519.pub)" >> ~/.config/git/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers

git log --show-signature -1        # toont de handtekening bij de laatste commit
git log --format="%h %G? %s" -5    # G = goed, N = geen handtekening
```

Twee dingen om te weten. Commits die GitHub zelf maakt, zoals een merge via de
knop in de browser, ondertekent GitHub met een eigen sleutel; die staan lokaal
als `E` omdat jouw kopie die sleutel niet kent. En raakt je sleutel kwijt of
vervang je hem, dan blijven oude commits ondertekend met de oude sleutel: je
hoeft de geschiedenis niet opnieuw te ondertekenen.

---

## Bijlage: spiekbriefje

```bash
# Waar ben ik en wat is er veranderd
git status
git diff                      # nog niet klaargezet
git diff --staged             # wel klaargezet
git branch --show-current

# Vastleggen en versturen
git add <pad>
git commit -m "feat(aiia): ..."
git push
git push -u origin <branch>   # eerste keer voor een nieuwe branch

# Branches
git checkout add_aiia && git pull
git checkout -b aiia/<onderwerp>
git switch -                  # terug naar de vorige branch
git merge add_aiia            # haal add_aiia binnen in je eigen branch

# Geschiedenis lezen
git log --oneline -10
git log -S"multiselect_scrollable" --oneline    # wanneer kwam deze term erin?
git log -p --follow sources/aiia.yaml           # wat is er met dit bestand gebeurd?

# Terugdraaien
git restore <pad>
git restore --staged <pad>
git stash / git stash pop
git reflog

# Pull requests
gh pr create --base add_aiia
gh pr view --web
gh pr checks
```
