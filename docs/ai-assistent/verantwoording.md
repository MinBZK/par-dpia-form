# Verantwoording — assessment-tools (marketplace + plugin)

Verantwoording voor de in deze repo meegeleverde Claude-/Cursor-marketplace `assessment-tools` en de `assessments`-plugin. De structuur volgt die van `developer-overheid-nl/skills-marketplace` ([`docs/verantwoording.md`](https://github.com/developer-overheid-nl/skills-marketplace/blob/main/docs/verantwoording.md)) — de overheidsnorm voor AI-assistent-tooling. Dit is een **startpunt**; vul de met *(team)* gemarkeerde details aan.

## 1. Doel en toepassingsgebied

De `assessments`-plugin biedt domeinkennis en tooling voor **ontwikkelaars en redacteuren** die in de editor (Claude Code / Cursor) aan deze repo werken: het bewerken en valideren van de pre-scan-, DPIA- en IAMA-definities (`sources/*.yaml`), de begrippenkaders, het assessment-schema en de RVO-styling. Het is **geen invul-assistent voor eindgebruikers** die een assessment uitvoeren.

## 2. Eigenaarschap

- **Eigenaar:** MinBZK is eigenaar van de marketplace (`assessment-tools`) én van de `assessments`-plugin. De plugin woont in déze repo (`source: ./.claude/plugins/assessments`) onder de MinBZK GitHub-org; er is geen externe bron-repo, dus eigenaarschap valt samen met deze repo.
- **Inhoudelijk verantwoordelijke:** de juistheid van de pre-scan-, DPIA- en IAMA-inhoud ligt bij de eigenaar van het assessment-kader binnen MinBZK *(team: maak expliciet wie — bijv. het PAR-/privacy-team)*.

## 3. Review en AI-governance

- De skills en de agent zijn deels met AI-assistentie opgesteld en daarna door mensen gereviewd.
- Wijzigingen aan de plugin én aan de bronnen (`sources/`) lopen via **pull request met menselijke review** door de maintainers van deze repo; CI valideert vóór merge (de **100%-dekkingsgate** en de schema-validatie van de YAML-bronnen, ondersteund door de `assessment-validator`-agent).
- Versiebeheer via `plugin.json` / `marketplace.json` (`version`). *(team: leg eventueel een `CODEOWNERS` vast voor wie de plugin en de bronnen reviewt.)*

## 4. Risico's

- **Persoonsgegevens:** de plugin en skills bevatten geen echte persoonsgegevens; voorbeelden zijn fictief.
- **AI-verordening / DPIA:** de plugin ondersteunt het *opstellen* van assessments en is zelf geen geautomatiseerde besluitvorming.
- **Beveiliging:** conform de BIO2-maatregelen van de repo; de `allowed-tools` van skills/agent zijn beperkt tot het noodzakelijke.
- **Bronnen/auteursrecht:** de domeinkennis is gebaseerd op publieke bronnen (Rijksmodel DPIA, IAMA/Universiteit Utrecht, Algoritmekader).
- **Caveat:** gebruik van de plugin is **geen compliance-garantie**; gebruikende organisaties doen dit onder eigen verantwoordelijkheid en conform eigen organisatiebeleid.

## 5. Licentie en transparantie

EUPL-1.2 (zie [`LICENSE`](../../LICENSE)), publieke GitHub-repo, conform open-tenzij-beleid. *(team: overweeg een `publiccode.yml` met `legal.mainCopyrightOwner` en een onderhouds-contact, zoals de developer-overheid-nl-marketplace doet.)*
