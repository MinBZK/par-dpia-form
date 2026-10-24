// Tests for chat.mjs against an in-test stand-in for the experiment API, so the
// suite never spends VLAM budget or needs a login.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Readable, Writable } from 'node:stream'
import { runCli, getToken, ChatError } from './chat.mjs'

const TOKEN = 'test-token'
const MODELS = ['model-a', 'model-b']
let api, apiUrl
const requests = []

// Answers like routes/chat.ts: bearer check, model list, and a reply that
// reports how many messages it got so the tests can check the history.
function createFakeApi() {
  return createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: raw })
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return json(401, { status: 401, detail: 'Token ontbreekt of is ongeldig.' })
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

async function run(args, { env = { AIIA_API_URL: apiUrl, AIIA_TOKEN: TOKEN }, input = '', readToken } = {}) {
  const lines = []
  const stdout = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const io = { stdin: Readable.from([input]), stdout, log: (line) => lines.push(line) }
  await runCli(args, { env, io, readToken })
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

test('a token is accepted with or without the "Bearer " prefix', async () => {
  assert.equal(await getToken({ AIIA_TOKEN: `Bearer ${TOKEN}` }), TOKEN)
  assert.equal(await getToken({ AIIA_TOKEN: ` ${TOKEN}\n` }), TOKEN)
})

test('without AIIA_TOKEN the script asks for the token', async () => {
  const prompts = []
  const readToken = async (prompt) => {
    prompts.push(prompt)
    return `Bearer ${TOKEN}`
  }
  const lines = await run(['modellen'], { env: { AIIA_API_URL: apiUrl }, readToken })
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /Plak je token/)
  assert.equal(lines[0], 'model-a  (standaard)')
})

test('an empty pasted token is an error', async () => {
  await assert.rejects(
    run(['modellen'], { env: { AIIA_API_URL: apiUrl }, readToken: async () => '  ' }),
    (error) => error instanceof ChatError && /Geen token opgegeven/.test(error.message),
  )
})

test('an expired token gives the status, the server detail and a hint', async () => {
  await assert.rejects(
    run(['modellen'], { env: { AIIA_API_URL: apiUrl, AIIA_TOKEN: 'verlopen' } }),
    /Fout 401\. Token ontbreekt of is ongeldig\.\nNiet ingelogd of token verlopen/,
  )
})

test('a model VLAM refuses surfaces as 502 with a hint to pick another', async () => {
  await assert.rejects(run(['vraag', 'Hoi', '--model', 'bestaat-niet']), /Fout 502\..*\nVLAM gaf een fout/s)
})

test('usage, unknown commands and a missing question are handled before asking for a token', async () => {
  const readToken = async () => assert.fail('should not ask for a token')
  const env = { AIIA_API_URL: apiUrl }
  assert.match((await run([], { env, readToken }))[0], /^Gebruik:/)
  await assert.rejects(run(['onzin'], { env, readToken }), /Onbekend commando "onzin"/)
  await assert.rejects(run(['vraag'], { env, readToken }), /Geef een vraag mee/)
})

test('an unreachable API gives a readable message', async () => {
  await assert.rejects(
    run(['modellen'], { env: { AIIA_API_URL: 'http://127.0.0.1:9', AIIA_TOKEN: TOKEN } }),
    /API niet bereikbaar op http:\/\/127\.0\.0\.1:9\./,
  )
})
