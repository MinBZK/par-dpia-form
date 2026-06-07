# Verantwoording — assessments-plugin

Deze verantwoording volgt de structuur die `developer-overheid-nl/skills-marketplace` hanteert voor AI-assistent-tooling bij de overheid (zie hun [`docs/verantwoording.md`](https://github.com/developer-overheid-nl/skills-marketplace/blob/main/docs/verantwoording.md)). Dit is een **startpunt**; de governance-details (eigenaarschap, goedkeurders) zijn nog door het team te bevestigen.

## 1. Doel en toepassingsgebied

De `assessments`-plugin biedt **domeinkennis en tooling voor ontwikkelaars en redacteuren** die in de editor (Claude Code / Cursor) aan deze repo werken: het bewerken en valideren van de pre-scan-, DPIA- en IAMA-definities (`sources/*.yaml`), de begrippenkaders, het assessment-schema en de RVO-styling. Het is **geen invul-assistent voor eindgebruikers** die een assessment uitvoeren.

## 2. Juiste mensen en vaardigheden

Wijzigingen lopen via pull requests met menselijke review. Inhoudelijke wijzigingen aan de assessment-definities worden afgestemd met de betrokken standaard- en inhoudseigenaren (o.a. het PAR-/privacy-team voor DPIA en pre-scan). *(Team: vul de concrete eigenaren/goedkeurders aan.)*

## 3. AI-governance en review

- De skills en de agent zijn deels met AI-assistentie opgesteld en daarna door mensen gereviewd.
- De definities worden gecontroleerd door de `assessment-validator`-agent en door de geautomatiseerde tests met een **100%-dekkingseis** (CI).
- Versiebeheer via `plugin.json` (`version`); goedkeuring via PR-review.

## 4. Risico's

- **Persoonsgegevens:** de plugin en skills bevatten geen echte persoonsgegevens; voorbeelden zijn fictief.
- **AI-verordening / DPIA:** de plugin ondersteunt het *opstellen* van assessments, maar is zelf geen geautomatiseerde besluitvorming.
- **Beveiliging:** conform de BIO2-maatregelen van de repo; de `allowed-tools` van skills/agent zijn beperkt tot het noodzakelijke.
- **Bronnen/auteursrecht:** de domeinkennis is gebaseerd op publieke bronnen (Rijksmodel DPIA, IAMA/Universiteit Utrecht, Algoritmekader).
- **Caveat:** het gebruik van deze plugin is **geen compliance-garantie**.

## 5. Licentie en transparantie

EUPL-1.2 (zie [`LICENSE`](../../LICENSE)), publieke GitHub-repo, conform open-tenzij-beleid.
