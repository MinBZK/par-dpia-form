# Governance

Dit document beschrijft wie Invulhulpen onderhoudt, hoe besluiten tot stand komen en hoe bijdragen worden beoordeeld. Wil je bijdragen, begin dan bij [CONTRIBUTING.md](CONTRIBUTING.md). Zoek je hulp, kijk dan in [SUPPORT.md](SUPPORT.md).

## Eigenaar en onderhoud

Invulhulpen is eigendom van het Ministerie van Binnenlandse Zaken en Koninkrijksrelaties en wordt onderhouden door het team achter [`@MinBZK/dpia`](https://github.com/orgs/MinBZK/teams/dpia). Dat team staat in [`.github/CODEOWNERS`](.github/CODEOWNERS) als code-eigenaar van de hele repository en is daarmee de reviewer van bijdragen.

De software wordt gebouwd en beheerd met publieke middelen. Er is geen commerciële licentie, geen aparte betaalde versie en geen bijdrageovereenkomst die auteursrecht overdraagt.

## Twee soorten besluiten

**Over de software.** Functionaliteit, techniek en prioriteiten worden in de openbare issues en pull requests besproken en door het onderhoudsteam besloten. Wie een richting wil voorstellen, opent een issue voordat er code komt; dat scheelt werk aan beide kanten.

**Over de inhoud van de assessments.** De vragen en toelichtingen in [`sources/`](sources/) volgen het Rijksmodel DPIA en het IAMA-kader. Die inhoud wordt niet in deze repository bepaald. Het onderhoudsteam voert wijzigingen door zodra de kaderhouder ze vaststelt, en kan zelf geen vragen toevoegen of herformuleren die van het model afwijken. Constateer je dat de invulhulp het model verkeerd weergeeft, meld dat dan als issue; dat is wel iets wat hier opgelost wordt.

## Hoe een wijziging binnenkomt

1. Elke wijziging gaat via een pull request, ook die van het onderhoudsteam. Er wordt niet rechtstreeks naar `main` gepusht.
2. Op `main` staat een ruleset met verplichte controles: de testsuite met een dekkingsdrempel van 100 procent, de pre-commit-controles en een scan van beide container-images. Een pull request die daar niet doorheen komt, wordt niet samengevoegd.
3. Bijdragers gaan akkoord met de [Developer Certificate of Origin](DCO.md), zoals de pull-request-template vraagt.
4. Wijzigingen worden gedocumenteerd in [`CHANGELOG.md`](CHANGELOG.md), geschreven vanuit wat een gebruiker ervan merkt.

## Review

**Bijdragen van buiten het onderhoudsteam worden altijd door een maintainer gereviewd.** Zonder uitzondering, en met inhoudelijke terugkoppeling als een bijdrage niet wordt overgenomen.

**Bij bijdragen van het onderhoudsteam zelf beoordeelt de auteur of een tweede paar ogen nodig is.** Dat is niet vrijblijvend: een tweede reviewer is in elk geval vereist bij

- wijzigingen in authenticatie, autorisatie of rolafhandeling;
- databaseschema's en migraties;
- de verwerking of bewaring van persoonsgegevens;
- de inhoud van `sources/` en de afgeleide begrippenkaders;
- de beveiligingsconfiguratie van de containers, waaronder de CSP en de security-headers;
- deployment- en releaseworkflows;
- alles waarvan de auteur zelf twijfelt of het klopt.

Buiten die gevallen kan een maintainer een wijziging na groene CI zelf samenvoegen. Dat geldt bijvoorbeeld voor tekstcorrecties, documentatie, dependency-updates en afgebakende bugfixes met dekking in de testsuite.

Dit wijkt af van criterium 7 van de Standard for Public Code, dat review van álle bijdragen vraagt. De afweging en de gevolgen staan in [`docs/standard-for-public-code.md`](docs/standard-for-public-code.md).

## Releases

Releases volgen [Calendar Versioning](https://calver.org/) in de vorm `YYYY.M.D`. Het releaseproces staat in [CONTRIBUTING.md](CONTRIBUTING.md). Een release wordt uitgebracht door het onderhoudsteam; er is geen vast ritme.

## Dit document wijzigen

Wijzigingen in deze governance gaan zoals elke andere wijziging: via een pull request, met review door een tweede lid van het onderhoudsteam.
