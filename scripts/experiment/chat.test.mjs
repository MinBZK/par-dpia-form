// Tests for chat.mjs against an in-test stand-in for the experiment API, so the
// suite never spends VLAM budget or needs a chat key.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { runCli, getKey, ChatError } from './chat.mjs'

const KEY = 'test-key'
const MODELS = ['model-a', 'model-b']
let api, apiUrl
const requests = []

// Answers like routes/chat.ts: key check, model list, and a reply that reports
// how many messages it got so the tests can check the history.
function createFakeApi() {
  return createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: raw })
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      return json(401, { status: 401, detail: 'Ongeldig token' })
    }
    if (req.method === 'GET' && req.url === '/api/v1/chat/models') {
      return json(200, { models: MODELS, defaultModel: 'model-a' })
    }
    if (req.method === 'POST' && req.url === '/api/v1/chat') {
      const { model = 'model-a', messages } = JSON.parse(raw)
      if (!MODELS.includes(model)) return json(502, { status: 502, detail: 'VLAM antwoordde met status 404.' })
      const question = messages.at(-1).content
      return json(200, { reply: `antwoord op "${question}" (${messages.length} berichten)`, model })
    }
    return json(404, {})
  })
}

before(async () => {
  api = createFakeApi()
  await new Promise((resolve) => api.listen(0, resolve))
  apiUrl = `http://localhost:${api.address().port}`
})

after(() => api.close())

beforeEach(() => {
  requests.length = 0
})

async function run(args, { env = { AIIA_API_URL: apiUrl, AIIA_KEY: KEY }, input = '', readKey } = {}) {
  const lines = []
  const stdout = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const io = { stdin: Readable.from([input]), stdout, log: (line) => lines.push(line) }
  await runCli(args, { env, io, readKey })
  return lines
}

test('modellen lists the models and marks the default', async () => {
  assert.deepEqual(await run(['modellen']), ['model-a  (standaard)', 'model-b'])
})

test('vraag sends a system and a user message with the chosen model', async () => {
  const lines = await run(['vraag', 'Wat', 'is', 'een', 'AIIA?', '--model', 'model-b', '--systeem', 'Wees kort.'])
  assert.equal(lines[0], 'model-b> antwoord op "Wat is een AIIA?" (2 berichten)')
  const sent = JSON.parse(requests.find((r) => r.url === '/api/v1/chat').body)
  assert.equal(sent.model, 'model-b')
  assert.deepEqual(sent.messages, [
    { role: 'system', content: 'Wees kort.' },
    { role: 'user', content: 'Wat is een AIIA?' },
  ])
})

test('without --model the server picks its default model', async () => {
  await run(['vraag', 'Hoi'])
  const sent = JSON.parse(requests.find((r) => r.url === '/api/v1/chat').body)
  assert.equal('model' in sent, false)
})

test('gesprek replays the full history on every turn and stops on an empty line', async () => {
  const lines = await run(['gesprek'], { input: 'Eerste vraag\nTweede vraag\n\nNiet meer verstuurd\n' })
  const chats = requests.filter((r) => r.url === '/api/v1/chat').map((r) => JSON.parse(r.body))
  assert.equal(chats.length, 2)
  assert.deepEqual(chats[1].messages.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
  assert.ok(lines.includes('\nmodel-a> antwoord op "Tweede vraag" (4 berichten)'))
})

test('gesprek also stops on "stop"', async () => {
  await run(['gesprek'], { input: 'Vraag\nstop\nNiet meer verstuurd\n' })
  assert.equal(requests.filter((r) => r.url === '/api/v1/chat').length, 1)
})

test('a key is accepted with or without the "Bearer " prefix', async () => {
  assert.equal(await getKey({ AIIA_KEY: `Bearer ${KEY}` }, apiUrl), KEY)
  assert.equal(await getKey({ AIIA_KEY: ` ${KEY}\n` }, apiUrl), KEY)
})

test('without AIIA_KEY the script asks for the key and says where to make one', async () => {
  const prompts = []
  const readKey = async (prompt) => {
    prompts.push(prompt)
    return KEY
  }
  const lines = await run(['modellen'], { env: { AIIA_API_URL: apiUrl }, readKey })
  assert.deepEqual(prompts, [`Plak je chat-sleutel (maak er een op ${apiUrl}/chat-sleutel): `])
  assert.equal(lines[0], 'model-a  (standaard)')
})

test('an empty pasted key is an error', async () => {
  await assert.rejects(
    run(['modellen'], { env: { AIIA_API_URL: apiUrl }, readKey: async () => '  ' }),
    (error) => error instanceof ChatError && /Geen chat-sleutel opgegeven/.test(error.message),
  )
})

test('an expired key gives the status, the server detail and where to make a new one', async () => {
  await assert.rejects(
    run(['modellen'], { env: { AIIA_API_URL: apiUrl, AIIA_KEY: 'verlopen' } }),
    /Fout 401\. Ongeldig token\nChat-sleutel verlopen of ongeldig\. Maak een nieuwe in de webapp op \/chat-sleutel\./,
  )
})

test('a model VLAM refuses surfaces as 502 with a hint to pick another', async () => {
  await assert.rejects(run(['vraag', 'Hoi', '--model', 'bestaat-niet']), /Fout 502\..*\nVLAM gaf een fout/s)
})

test('usage, unknown commands and a missing question are handled before asking for a key', async () => {
  const readKey = async () => assert.fail('should not ask for a key')
  const env = { AIIA_API_URL: apiUrl }
  assert.match((await run([], { env, readKey }))[0], /^Gebruik:/)
  await assert.rejects(run(['onzin'], { env, readKey }), /Onbekend commando "onzin"/)
  await assert.rejects(run(['vraag'], { env, readKey }), /Geef een vraag mee/)
})

test('an unreachable API gives a readable message', async () => {
  await assert.rejects(
    run(['modellen'], { env: { AIIA_API_URL: 'http://127.0.0.1:9', AIIA_KEY: KEY } }),
    /API niet bereikbaar op http:\/\/127\.0\.0\.1:9\./,
  )
})


// A small AIIA in the shape of sources/aiia.yaml.
const AIIA_FIXTURE = `
tasks:
  - task: Doel en noodzaak
    id: "1"
    type: [task_group]
    tasks:
      - task: Doel van het systeem
        id: "1.1"
        description: Welk probleem moet opgelost worden?
        type: [task_group]
        tasks:
          - task: Geef een korte beschrijving van het beoogde doel.
            description: Denk aan doelgroepen en het werkproces.
            id: "1.1.1"
            type: [open_text]
          - task: In welk risicogebied past jouw AI-systeem?
            id: "1.1.2"
            type: [select_option]
            options:
              - value: hoog
                label: Hoog risico
              - value: minimaal
`
let fixtureDir, bron
before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'aiia-'))
  bron = join(fixtureDir, 'aiia.yaml')
  await writeFile(bron, AIIA_FIXTURE)
})
after(() => rm(fixtureDir, { recursive: true, force: true }))

const lastChat = () => JSON.parse(requests.filter((r) => r.url === '/api/v1/chat').at(-1).body)

test('toets sends the question, its context and the answer for review', async () => {
  const lines = await run(['toets', '1.1.1', '--bron', bron, '--antwoord', 'Een chatbot voor burgers.'])
  const { messages } = lastChat()
  assert.equal(messages.length, 2)
  assert.match(messages[0].content, /beoordeelt antwoorden op vragen uit het AI Impact Assessment/)
  assert.equal(messages[1].content, [
    'Vraag 1.1.1: Geef een korte beschrijving van het beoogde doel.',
    'Toelichting: Denk aan doelgroepen en het werkproces.',
    'Onderdeel: Doel en noodzaak > Doel van het systeem',
    'Uitleg bij het onderdeel: Welk probleem moet opgelost worden?',
    '',
    'Antwoord:',
    'Een chatbot voor burgers.',
  ].join('\n'))
  assert.match(lines[0], /geen echte persoonsgegevens/)
})

test('toets lists the answer options, and reads the answer from a file or from input', async () => {
  const file = join(fixtureDir, 'antwoord.txt')
  await writeFile(file, 'Hoog risico, want het gaat om uitkeringen.\n')
  await run(['toets', '1.1.2', '--bron', bron, '--bestand', file, '--systeem', 'Wees streng.'])
  assert.match(lastChat().messages[1].content, /Antwoordopties: Hoog risico; minimaal/)
  assert.equal(lastChat().messages[0].content, 'Wees streng.')
  assert.match(lastChat().messages[1].content, /Antwoord:\nHoog risico, want het gaat om uitkeringen\.$/)

  await run(['toets', '1.1.1', '--bron', bron], { input: 'Regel een\nRegel twee\n\nniet meer\n' })
  assert.match(lastChat().messages[1].content, /Antwoord:\nRegel een\nRegel twee$/)
})

test('toets checks the question before asking for the key', async () => {
  const readKey = async () => assert.fail('should not ask for a key')
  const env = { AIIA_API_URL: apiUrl }
  await assert.rejects(run(['toets'], { env, readKey }), /Geef een vraagnummer mee/)
  await assert.rejects(run(['toets', '9.9', '--bron', bron], { env, readKey }), /Vraag 9\.9 staat niet in het AIIA/)
  await assert.rejects(run(['toets', '1.1', '--bron', bron], { env, readKey }), /1\.1 is een onderdeel, geen vraag\. Kies een vraag daarbinnen: 1\.1\.1, 1\.1\.2\./)
  await assert.rejects(run(['toets', '1.1.1', '--bron', join(fixtureDir, 'weg.yaml')], { env, readKey }), /niet te lezen/)
  assert.equal(requests.length, 0)
})

test('toets refuses an empty answer, an unreadable file and an answer that is too long', async () => {
  await assert.rejects(run(['toets', '1.1.1', '--bron', bron], { input: '\n' }), /Geen antwoord opgegeven/)
  await assert.rejects(run(['toets', '1.1.1', '--bron', bron, '--bestand', join(fixtureDir, 'weg.txt')]), /niet te lezen/)
  await assert.rejects(run(['toets', '1.1.1', '--bron', bron, '--antwoord', 'x'.repeat(8000)]), /te lang/)
  assert.equal(requests.filter((r) => r.url === '/api/v1/chat').length, 0)
})

test('toets works on the real sources/aiia.yaml', async () => {
  await run(['toets', '1.1.1', '--antwoord', 'Test.'])
  assert.match(lastChat().messages[1].content, /^Vraag 1\.1\.1: /)
})
