<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '../components/AppHeader.vue'

const hasHistory = computed(() => !!window.history.state?.back)
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader
      :backLabel="hasHistory ? 'Terug' : 'Ga naar home'"
      :backRoute="hasHistory ? undefined : '/'"
      :showBack="hasHistory"
    />

    <h1 class="utrecht-heading-1">Privacyverklaring</h1>

    <p>
      De Assessment Boekhouding is een applicatie van het Ministerie van Binnenlandse Zaken en
      Koninkrijksrelaties (BZK) voor het uitvoeren van assessments. In deze
      privacyverklaring leggen we uit welke persoonsgegevens we verwerken, waarom we dat doen,
      en welke rechten je hebt.
    </p>

    <h2 class="utrecht-heading-2">Welke gegevens verwerken we?</h2>
    <p>Bij het gebruik van de Assessment Boekhouding verwerken we de volgende persoonsgegevens:</p>
    <ul>
      <li><strong>E-mailadres</strong> — verkregen via de inlogvoorziening (SSO Rijk / RIG Keycloak) bij authenticatie</li>
      <li><strong>Weergavenaam</strong> — verkregen via de inlogvoorziening bij authenticatie</li>
      <li><strong>Bewerkingsgeschiedenis</strong> — welke gebruiker welke velden heeft gewijzigd en wanneer</li>
      <li><strong>Projectlidmaatschap</strong> — welke gebruikers lid zijn van welke projecten en hun rol daarin</li>
      <li><strong>IP-adres en request-metadata</strong> — worden vastgelegd in serverlogboeken ten behoeve van beveiliging en foutopsporing</li>
    </ul>

    <h2 class="utrecht-heading-2">Waarom verwerken we deze gegevens?</h2>
    <p>We verwerken deze gegevens voor de volgende doeleinden:</p>
    <ul>
      <li><strong>Authenticatie en autorisatie</strong> — om te bepalen wie toegang heeft tot welke projecten</li>
      <li><strong>Samenwerking</strong> — zodat meerdere gebruikers samen aan een assessment kunnen werken</li>
      <li><strong>Audit trail</strong> — om een traceerbare historie te bieden van wie wat heeft gewijzigd, ten behoeve van kwaliteitsborging en verantwoording</li>
    </ul>

    <h2 class="utrecht-heading-2">Rechtsgrond</h2>
    <p>
      De verwerking is gebaseerd op gerechtvaardigd belang
      (<a href="https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX%3A32016R0679#d1e1883-1-1" target="_blank" rel="noopener">artikel 6, lid 1, sub f AVG</a>).
      Het belang is het mogelijk maken om veilig en reproduceerbaar samen te werken aan assessments
      in de context van de overheid.
    </p>

    <h2 class="utrecht-heading-2">Bewaartermijnen</h2>
    <p>
      Persoonsgegevens worden bewaard zolang een project actief is. Wanneer een project wordt
      verwijderd, worden alle bijbehorende gegevens (inclusief bewerkingsgeschiedenis) permanent
      verwijderd. Accountgegevens (e-mailadres, weergavenaam) blijven beschikbaar zolang de
      gebruiker een account heeft.
    </p>
    <p>
      De applicatie biedt op dit moment geen zelfbedieningsfunctie voor het verwijderen van accounts.
      Wanneer je geen gebruik meer maakt van de applicatie (bijvoorbeeld bij uitdiensttreding),
      kun je contact opnemen om verwijdering van je accountgegevens te verzoeken.
    </p>

    <h2 class="utrecht-heading-2">Ontvangers</h2>
    <p>
      Persoonsgegevens worden niet gedeeld met derden en niet doorgegeven aan landen buiten de
      Europese Economische Ruimte (EER). De gegevens zijn uitsluitend toegankelijk voor gebruikers
      die lid zijn van hetzelfde project, en voor systeembeheerders.
    </p>

    <h2 class="utrecht-heading-2">Beveiliging</h2>
    <p>
      We nemen passende technische en organisatorische maatregelen om je gegevens te beschermen,
      waaronder:
    </p>
    <ul>
      <li>Versleutelde verbindingen (TLS)</li>
      <li>Authenticatie via SSO Rijk (OpenID Connect)</li>
      <li>Rolgebaseerde toegangscontrole (eigenaar, bewerker, lezer)</li>
      <li>Veld-niveau auditlogging</li>
    </ul>

    <h2 class="utrecht-heading-2">Je rechten</h2>
    <p>Op grond van de AVG heb je de volgende rechten:</p>
    <ul>
      <li><strong>Inzage</strong> — je kunt opvragen welke gegevens we van je verwerken</li>
      <li><strong>Rectificatie</strong> — je kunt onjuiste gegevens laten corrigeren</li>
      <li><strong>Verwijdering</strong> — je kunt verzoeken om verwijdering van je gegevens</li>
      <li><strong>Beperking</strong> — je kunt vragen om beperking van de verwerking</li>
      <li><strong>Bezwaar</strong> — je kunt bezwaar maken tegen de verwerking</li>
    </ul>
    <p>
      Voor het uitoefenen van deze rechten kun je contact opnemen via
      <a href="mailto:RIG@rijksoverheid.nl">RIG@rijksoverheid.nl</a>.
    </p>

    <h2 class="utrecht-heading-2">Verplicht of vrijwillig</h2>
    <p>
      Het verstrekken van je e-mailadres en weergavenaam is noodzakelijk om de applicatie te
      kunnen gebruiken. Deze gegevens worden automatisch verstrekt door de inlogvoorziening.
      Zonder deze gegevens kun je niet inloggen en deelnemen aan projecten.
    </p>

    <h2 class="utrecht-heading-2">Geautomatiseerde besluitvorming</h2>
    <p>
      De applicatie maakt geen gebruik van geautomatiseerde besluitvorming of profilering.
    </p>

    <h2 class="utrecht-heading-2">Klacht indienen</h2>
    <p>
      Als je een klacht hebt over de verwerking van je persoonsgegevens, kun je deze indienen
      bij de <a href="https://autoriteitpersoonsgegevens.nl/klacht-indienen" target="_blank" rel="noopener">Autoriteit Persoonsgegevens</a>.
    </p>

    <h2 class="utrecht-heading-2">Contact</h2>
    <p>
      Ministerie van Binnenlandse Zaken en Koninkrijksrelaties<br />
      E-mail: <a href="mailto:RIG@rijksoverheid.nl">RIG@rijksoverheid.nl</a>
    </p>
  </div>
</template>
