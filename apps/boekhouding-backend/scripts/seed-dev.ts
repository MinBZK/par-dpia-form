import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, and, inArray } from 'drizzle-orm'
import postgres from 'postgres'
import { config } from '../src/config.js'
import { users, projects, projectMembers, assessmentInstances, assessmentVersions, comments } from '../src/db/schema.js'

const queryClient = postgres(config.databaseUrl)
const db = drizzle(queryClient)

const now = new Date().toISOString()
const OUTPUT_SCHEMA = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'
const PRESCAN_URN = 'urn:nl:prescan:2.0'
const DPIA_URN = 'urn:nl:dpia:3.0'

// Upsert test users (matching Keycloak config)
const [sam] = await db.insert(users)
  .values({ email: 'sam@example.com', displayName: 'Sam van der Berg', oidcSub: null })
  .onConflictDoUpdate({ target: users.email, set: { displayName: 'Sam van der Berg' } })
  .returning()

const [noor] = await db.insert(users)
  .values({ email: 'noor@example.com', displayName: 'Noor Dijkstra', oidcSub: null })
  .onConflictDoUpdate({ target: users.email, set: { displayName: 'Noor Dijkstra' } })
  .returning()

// Clean up existing seed projects (cascade deletes members, assessments, versions)
const seedUserIds = [sam.id, noor.id]
await db.delete(projects).where(inArray(projects.createdBy, seedUserIds))

console.log('Users ready:', sam.email, noor.email)

// Project 1: prescan with realistic answers
const [projectPrescan] = await db.insert(projects).values({
  name: 'Aanvraagportaal Subsidies',
  description: 'Nieuw digitaal portaal voor het aanvragen en beheren van subsidies bij RVO. Burgers en ondernemers kunnen subsidieaanvragen indienen, documenten uploaden en de status volgen.',
  createdBy: sam.id,
}).returning()

await db.insert(projectMembers).values([
  { projectId: projectPrescan.id, userId: sam.id, role: 'owner', acceptedAt: new Date() },
  { projectId: projectPrescan.id, userId: noor.id, role: 'editor', acceptedAt: new Date() },
])

// Assessment state uses v2 unified format (see schemas/assessment-output.v2.schema.json):
// - Flat answer keys (no prescan/dpia namespace wrapper)
// - completedTasks in metadata (no separate taskState object)
// - URN includes version (e.g. urn:nl:dpia:3.0)
const prescanState = {
  $schema: OUTPUT_SCHEMA,
  metadata: {
    createdAt: now,
    urn: PRESCAN_URN,
  },
  answers: {
    '0.1': { value: 'false', lastEditedAt: now, lastEditedBy: sam.email },
    '0.2': {
      value: 'Het aanvraagportaal subsidies is een webapplicatie waarmee burgers en ondernemers subsidieaanvragen kunnen indienen bij RVO. Het systeem verwerkt NAW-gegevens, KvK-nummers, financiële gegevens en projectplannen. De applicatie draait op de Rijkscloud en wordt beheerd door het team Digitale Dienstverlening.',
      lastEditedAt: now,
      lastEditedBy: sam.email,
    },
    '0.3': {
      value: 'Het doel is het vereenvoudigen en versnellen van het subsidieaanvraagproces. Burgers en ondernemers kunnen 24/7 aanvragen indienen, de status volgen en communiceren met behandelaars. Dit vervangt het huidige papieren proces.',
      lastEditedAt: now,
      lastEditedBy: noor.email,
    },
    '0.4': {
      value: 'Rechtsgrond wettelijke verplichting',
      lastEditedAt: now,
      lastEditedBy: noor.email,
    },
  },
}

const [prescanInstance] = await db.insert(assessmentInstances).values({
  projectId: projectPrescan.id,
  assessmentType: 'prescan',
  name: 'Pre-scan subsidieportaal',
  createdBy: sam.id,
  currentVersion: 1,
  cachedState: prescanState,
}).returning()

await db.insert(assessmentVersions).values({
  assessmentInstanceId: prescanInstance.id,
  version: 1,
  createdBy: sam.id,
  changeDescription: 'Eerste versie met basisgegevens ingevuld',
})

console.log('Project created:', projectPrescan.name)

// Project 2: DPIA with two versions
const [projectDpia] = await db.insert(projects).values({
  name: 'Cameratoezicht Stationsgebied',
  description: 'Implementatie van intelligent cameratoezicht op het stationsgebied Utrecht Centraal. Samenwerking tussen gemeente, NS en politie voor veiligheidsmonitoring.',
  createdBy: noor.id,
}).returning()

await db.insert(projectMembers).values([
  { projectId: projectDpia.id, userId: noor.id, role: 'owner', acceptedAt: new Date() },
  { projectId: projectDpia.id, userId: sam.id, role: 'viewer', acceptedAt: new Date() },
])

const dpiaStateV2 = {
  $schema: OUTPUT_SCHEMA,
  metadata: {
    createdAt: now,
    urn: DPIA_URN,
    completedTasks: ['0', '1'],
  },
  answers: {
    '0': {
      value: 'Deze DPIA is opgesteld in het kader van de voorgenomen plaatsing van intelligente camera\'s in het stationsgebied Utrecht Centraal. De camera\'s maken gebruik van beeldherkenning voor het detecteren van verdacht gedrag en crowdmanagement.',
      lastEditedAt: now,
      lastEditedBy: noor.email,
    },
    '1.1': {
      value: 'De gemeente Utrecht wil in samenwerking met NS en de politie intelligent cameratoezicht implementeren op het stationsgebied. Het systeem analyseert real-time beelden om verdachte situaties te detecteren, drukte te monitoren en bij incidenten snel te kunnen reageren. Er worden circa 45 camera\'s geplaatst die 24/7 beelden vastleggen.',
      lastEditedAt: now,
      lastEditedBy: noor.email,
    },
  },
}

const [dpiaInstance] = await db.insert(assessmentInstances).values({
  projectId: projectDpia.id,
  assessmentType: 'dpia',
  name: 'DPIA Cameratoezicht',
  createdBy: noor.id,
  currentVersion: 2,
  cachedState: dpiaStateV2,
}).returning()

await db.insert(assessmentVersions).values([
  {
    assessmentInstanceId: dpiaInstance.id,
    version: 1,
    createdBy: noor.id,
    changeDescription: 'Inleiding toegevoegd',
  },
  {
    assessmentInstanceId: dpiaInstance.id,
    version: 2,
    createdBy: noor.id,
    changeDescription: 'Voorstel uitgewerkt met details over camerasysteem',
  },
])

// Give Sam a commenter role on the DPIA project (upgrade from viewer)
await db.update(projectMembers)
  .set({ role: 'commenter' })
  .where(
    and(
      eq(projectMembers.projectId, projectDpia.id),
      eq(projectMembers.userId, sam.id),
    ),
  )

// Add example comments on the DPIA assessment
const [comment1] = await db.insert(comments).values({
  assessmentInstanceId: dpiaInstance.id,
  fieldId: '0',
  authorId: sam.id,
  body: 'Moeten we hier ook de verwerkingsverantwoordelijke benoemen? De AP verwacht dat in de inleiding.',
}).returning()

await db.insert(comments).values({
  assessmentInstanceId: dpiaInstance.id,
  fieldId: '0',
  parentId: comment1.id,
  authorId: noor.id,
  body: 'Goed punt. De gemeente Utrecht is verwerkingsverantwoordelijke, NS en politie zijn verwerkers. Ik pas het aan.',
})

const [comment2] = await db.insert(comments).values({
  assessmentInstanceId: dpiaInstance.id,
  fieldId: '1.1',
  authorId: sam.id,
  body: 'Wordt er ook gezichtsherkenning toegepast? Dat heeft impact op de rechtmatigheidstoets.',
}).returning()

await db.insert(comments).values({
  assessmentInstanceId: dpiaInstance.id,
  fieldId: '1.1',
  parentId: comment2.id,
  authorId: noor.id,
  body: 'Nee, expliciet niet. Het gaat om gedragsdetectie (bewegingspatronen), geen biometrische identificatie. Staat in het PvE.',
})

// A resolved thread
await db.insert(comments).values({
  assessmentInstanceId: dpiaInstance.id,
  fieldId: '0',
  authorId: noor.id,
  body: 'Bron toevoegen voor het aantal camera\'s?',
  resolvedAt: new Date(),
  resolvedBy: noor.id,
})

console.log('Project created:', projectDpia.name)
console.log('Comments created:', 5)

// Project 3: empty project (orientation phase, no assessments yet)
const [projectEmpty] = await db.insert(projects).values({
  name: 'Digitaal Klantdossier Jeugdzorg',
  description: 'Verkenning naar een centraal digitaal klantdossier voor de jeugdzorg. Nog in de oriëntatiefase — er moet nog bepaald worden welke assessments nodig zijn.',
  createdBy: sam.id,
}).returning()

await db.insert(projectMembers).values({
  projectId: projectEmpty.id,
  userId: sam.id,
  role: 'owner',
  acceptedAt: new Date(),
})

console.log('Project created:', projectEmpty.name)

console.log('\nSeed complete! Created:')
console.log('  - 2 users (sam@example.com, noor@example.com)')
console.log('  - 3 projects with realistic scenarios')
console.log('  - 2 assessment instances (1 prescan, 1 DPIA)')
console.log('  - 3 assessment versions')
console.log('  - 5 comments (3 threads, 1 resolved) on DPIA assessment')
console.log('  - Sam has commenter role on DPIA project')

await queryClient.end()
