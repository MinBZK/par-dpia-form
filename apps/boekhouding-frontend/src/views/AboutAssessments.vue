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

    <h1 class="utrecht-heading-1">Over Invulhulpen</h1>

    <p>
      Invulhulpen helpt je bij het invullen van een pre-scan, een volledige DPIA en een IAMA.
      De pre-scan en DPIA zijn gebaseerd op het
      <a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank" rel="noopener noreferrer">Informatiemodellen voor de DPIA en pre-scan DPIA</a>
      en het
      <a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank" rel="noopener noreferrer">Rapportagemodel DPIA Rijksdienst</a>;
      het IAMA op
      <a href="https://www.rijksoverheid.nl/documenten/2026/02/16/impact-assessment-mensenrechten-en-algoritmes" target="_blank" rel="noopener noreferrer">het instrument</a>
      ontwikkeld door de Universiteit Utrecht.
      Ze sluiten aan op rijksbrede kaders.
    </p>

    <h2 class="utrecht-heading-2">Pre-scan</h2>
    <p>
      De pre-scan is een hulpmiddel om te bepalen of een DPIA, IAMA, DTIA of KIA nodig is. Door een
      aantal gerichte vragen te beantwoorden krijg je inzicht in welke assessments van toepassing
      zijn op jouw project.
    </p>

    <h3 class="utrecht-heading-3">Bronnen</h3>
    <ul>
      <li><a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank" rel="noopener noreferrer">Informatiemodellen voor de DPIA en pre-scan DPIA</a></li>
    </ul>

    <h2 class="utrecht-heading-2">DPIA</h2>
    <p>
      Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen
      in mogelijke privacyrisico's. Een DPIA is het instrument om van projecten waarbij
      persoonsgegevens worden verwerkt of beleid en regelgeving die kunnen leiden tot verwerking
      van persoonsgegevens de risico's voor de rechten en vrijheden van betrokkenen in kaart te
      brengen en te beoordelen in hoeverre de huidige maatregelen voldoen en welke aanvullende
      maatregelen genomen moeten worden om de risico's zoveel mogelijk te verminderen. Hiervoor
      is een rijksbreed model ontwikkeld.
    </p>

    <h3 class="utrecht-heading-3">Wanneer voer je een DPIA uit?</h3>
    <p>
      Een DPIA moet in een vroegtijdig stadium van de beleids- of projectontwikkeling worden
      uitgevoerd. Op dat moment is het namelijk nog mogelijk om met open vizier na te denken over
      de effecten en bestaat er nog voldoende gelegenheid om de uitgangspunten van het voorstel
      zonder grote nadelige consequenties te herzien. Dit voorkomt ook latere, kostbare
      aanpassingen in processen, herontwerp van systemen of zelfs stopzetten van een project.
    </p>

    <h3 class="utrecht-heading-3">Wettelijke verplichting</h3>
    <p>In de volgende gevallen is het verplicht om een DPIA uit te voeren:</p>
    <ol>
      <li>Bij de ontwikkeling van beleid en regelgeving waaruit verwerkingen van persoonsgegevens voortvloeien; of</li>
      <li>wanneer sprake is van een verplichting op basis van departementaal beleid; of</li>
      <li>bij gegevensverwerkingen van persoonsgegevens die waarschijnlijk een hoog risico inhouden voor de rechten en vrijheden van betrokkenen.</li>
    </ol>

    <h3 class="utrecht-heading-3">DPIA versie 3.0</h3>
    <p>
      Deze invulhulp is gebaseerd op het Rapportagemodel DPIA Rijksdienst, versie 3.0. Dit is het
      actuele rijksbrede rapportagemodel voor de DPIA.
    </p>

    <h3 class="utrecht-heading-3">Bronnen</h3>
    <ul>
      <li><a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank" rel="noopener noreferrer">Rapportagemodel DPIA Rijksdienst</a></li>
      <li><a href="https://www.kcbr.nl/beleid-en-regelgeving-ontwikkelen/beleidskompas/verplichte-kwaliteitseisen/data-protection-impact-assessment" target="_blank" rel="noopener noreferrer">Data Protection Impact Assessment - Kenniscentrum voor beleid en regelgeving</a></li>
    </ul>

    <h2 class="utrecht-heading-2">IAMA</h2>
    <p>
      Het Impact Assessment Mensenrechten en Algoritmes (IAMA) helpt overheidsorganisaties bij
      het beoordelen van de impact van algoritmes op mensenrechten en publieke waarden, voorafgaand
      aan de ontwikkeling of inzet van een algoritme. Het IAMA is een instrument voor discussie en
      besluitvorming dat een interdisciplinaire dialoog faciliteert tussen iedereen die betrokken is
      bij de ontwikkeling of inzet van een algoritmisch systeem. Het kan worden toegepast op
      AI-systemen, maar ook op algoritmische systemen die geen kunstmatige intelligentie bevatten.
    </p>

    <h3 class="utrecht-heading-3">Wanneer voer je een IAMA uit?</h3>
    <p>
      Het IAMA is een grondrechtenbeoordeling voor impactvolle algoritmes en hoog-risico
      AI-systemen. Voor hoog-risico AI-systemen schrijft de Europese AI-verordening een beoordeling
      van de gevolgen voor grondrechten voor (artikel 27 AI-verordening); het IAMA is een instrument
      om aan die verplichting invulling te geven. Daarnaast is het IAMA geschikt voor impactvolle
      algoritmes die niet als hoog-risico AI-systeem kwalificeren of die buiten het bereik van de
      AI-verordening vallen. Voer het IAMA in een vroegtijdig stadium uit, zodat de consequenties
      van de inzet van een algoritme zorgvuldig kunnen worden afgewogen voordat het wordt ingezet.
    </p>

    <h3 class="utrecht-heading-3">IAMA versie 2.0</h3>
    <p>
      Deze invulhulp is gebaseerd op IAMA versie 2.0. Dit is een actualisatie van de oorspronkelijke
      versie: gestroomlijnd op basis van gebruikersfeedback en in lijn gebracht met de vereisten uit
      artikel 27 van de Europese AI-verordening. Eerder ingevulde IAMA's (v1) hoeven niet herzien te
      worden.
    </p>
    <h3 class="utrecht-heading-3">Bronnen</h3>
    <ul>
      <li><a href="https://open.overheid.nl/documenten/d0947c02-81df-4c00-83df-d88b703025f4/file" target="_blank" rel="noopener noreferrer">IAMA v2.0 - Open Overheid</a></li>
      <li><a href="https://www.rijksoverheid.nl/documenten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes" target="_blank" rel="noopener noreferrer">IAMA-toelichtingsdocument - Rijksoverheid</a></li>
      <li><a href="https://minbzk.github.io/Algoritmekader/voldoen-aan-wetten-en-regels/hulpmiddelen/IAMA/" target="_blank" rel="noopener noreferrer">Algoritmekader - IAMA</a></li>
      <li><a href="https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=OJ:L_202401689#art_27" target="_blank" rel="noopener noreferrer">Artikel 27 AI-verordening - EUR-Lex</a></li>
    </ul>

    <h2 class="utrecht-heading-2">Zie ook</h2>
    <ul>
      <li><a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank" rel="noopener noreferrer">Privacy Adviseurs Rijk (PAR) - Rijksportaal</a></li>
    </ul>
  </div>
</template>
