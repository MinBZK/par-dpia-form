#!/usr/bin/env node
// Talk to the real model from the command line: this script runs on your own
// machine and calls the chat route of the experiment environment, which
// forwards to VLAM. VLAM itself only accepts traffic from ZAD, so there is no
// local shortcut. See docs/experiment/README.md.
//
//   node scripts/experiment/chat.mjs modellen
//   node scripts/experiment/chat.mjs vraag "Wat bedoelt vraag 4.1.2?"
//   node scripts/experiment/chat.mjs gesprek
//
// Needs your login token from the browser: in AIIA_TOKEN, or pasted when asked.
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'

export const API_URL = 'https://experiment-ai-3rt.rig.prd1.gn2.quattro.rijksapps.nl'

const DEFAULT_SYSTEM = 'Je helpt bij het invullen van het AIIA.'
// Mirrors the server's bounds (apps/boekhouding-backend/src/routes/chat.ts).
const MAX_MESSAGES = 50

const USAGE = `Gebruik:
  node scripts/experiment/chat.mjs modellen
  node scripts/experiment/chat.mjs vraag "<je vraag>"
  node scripts/experiment/chat.mjs gesprek

Opties:
  --model <id>               een id uit 'modellen'; zonder: het standaardmodel van de omgeving
  --systeem "<instructie>"   systeembericht; standaard: "${DEFAULT_SYSTEM}"

Het script vraagt om je token, of leest het uit AIIA_TOKEN (zie docs/experiment/README.md).
AIIA_API_URL kiest een ander API-adres; standaard ${API_URL}.`

export class ChatError extends Error {}

// What the user should do about each status the chat route can return.
const STATUS_HINTS = {
  400: 'Ongeldig verzoek, of geen model gekozen. Geef --model mee (zie "modellen").',
  401: 'Niet ingelogd of token verlopen. Haal een nieuw token op (zie docs/experiment/README.md).',
  502: 'VLAM gaf een fout. Kies een ander model met --model.',
  503: 'Chat is niet geconfigureerd in deze omgeving.',
  504: 'VLAM antwoordde niet op tijd. Probeer het opnieuw of stel een kortere vraag.',
}

// Reads one line without echoing it, so a pasted token stays off the screen.
async function readHidden(prompt, stdin = process.stdin, stdout = process.stdout) {
  stdout.write(prompt)
  const muted = new Writable({ write(_chunk, _enc, cb) { cb() } })
  const rl = createInterface({ input: stdin, output: muted, terminal: true })
  try {
    return await rl.question('')
  } finally {
    rl.close()
    stdout.write('\n')
  }
}

// Accepts the token with or without the "Bearer " prefix the browser shows.
export async function getToken(env, readToken = readHidden) {
  const raw = env.AIIA_TOKEN || (await readToken('Plak je token (Authorization-header uit de browser): '))
  const token = raw.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new ChatError('Geen token opgegeven (zie docs/experiment/README.md).')
  return token
}

async function callApi(apiUrl, token, path, fetchImpl, init = {}) {
  let response
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.body && { 'content-type': 'application/json' }) },
    })
  } catch {
    throw new ChatError(`API niet bereikbaar op ${apiUrl}.`)
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = body.detail ? ` ${body.detail}` : ''
    const hint = STATUS_HINTS[response.status] ? `\n${STATUS_HINTS[response.status]}` : ''
    throw new ChatError(`Fout ${response.status}.${detail}${hint}`)
  }
  return body
}

export const listModels = (apiUrl, token, fetchImpl) =>
  callApi(apiUrl, token, '/api/v1/chat/models', fetchImpl)

export const sendChat = (apiUrl, token, messages, model, fetchImpl) =>
  callApi(apiUrl, token, '/api/v1/chat', fetchImpl, {
    method: 'POST',
    body: JSON.stringify({ messages, ...(model && { model }) }),
  })

async function converse(apiUrl, token, options, io, fetchImpl) {
  // Iterating the interface (rather than question()) keeps lines that arrive
  // while a reply is pending, e.g. when input is piped in.
  const rl = createInterface({ input: io.stdin, terminal: false })
  const history = [{ role: 'system', content: options.systeem }]
  io.log('Gesprek gestart. Typ je vraag; een lege regel of "stop" beëindigt het gesprek.')
  io.stdout.write('\njij> ')
  try {
    for await (const line of rl) {
      if (!line.trim() || line.trim() === 'stop') break
      if (history.length + 2 > MAX_MESSAGES) {
        io.log(`Maximum van ${MAX_MESSAGES} berichten bereikt; start een nieuw gesprek.`)
        break
      }
      history.push({ role: 'user', content: line })
      const { reply, model } = await sendChat(apiUrl, token, history, options.model, fetchImpl)
      history.push({ role: 'assistant', content: reply })
      io.log(`\n${model}> ${reply}`)
      io.stdout.write('\njij> ')
    }
  } finally {
    rl.close()
  }
}

export async function runCli(argv, { env = process.env, fetchImpl = fetch, io, readToken } = {}) {
  io ??= { stdin: process.stdin, stdout: process.stdout, log: console.log }
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: 'string' },
      systeem: { type: 'string', default: DEFAULT_SYSTEM },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [command, ...rest] = positionals
  if (values.help || !command) {
    io.log(USAGE)
    return
  }
  if (!['modellen', 'vraag', 'gesprek'].includes(command)) {
    throw new ChatError(`Onbekend commando "${command}".\n\n${USAGE}`)
  }
  const question = rest.join(' ').trim()
  if (command === 'vraag' && !question) {
    throw new ChatError('Geef een vraag mee, bijvoorbeeld: vraag "Wat bedoelt vraag 4.1.2?"')
  }

  const apiUrl = (env.AIIA_API_URL || API_URL).replace(/\/+$/, '')
  const token = await getToken(env, readToken)

  if (command === 'modellen') {
    const { models, defaultModel } = await listModels(apiUrl, token, fetchImpl)
    for (const id of models) io.log(id === defaultModel ? `${id}  (standaard)` : id)
    if (!defaultModel) io.log('\nGeen standaardmodel ingesteld: geef --model mee bij vraag en gesprek.')
    return
  }
  if (command === 'vraag') {
    const messages = [
      { role: 'system', content: values.systeem },
      { role: 'user', content: question },
    ]
    const { reply, model } = await sendChat(apiUrl, token, messages, values.model, fetchImpl)
    io.log(`${model}> ${reply}`)
    return
  }
  return converse(apiUrl, token, values, io, fetchImpl)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli(process.argv.slice(2)).catch((error) => {
    const known = error instanceof ChatError || error.code?.startsWith('ERR_PARSE_ARGS')
    console.error(known ? error.message : error)
    process.exitCode = 1
  })
}
