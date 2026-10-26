#!/usr/bin/env node
// Talk to the real model from the command line: this script runs on your own
// machine and calls the chat route of the experiment environment, which
// forwards to VLAM. VLAM itself only accepts traffic from ZAD, so there is no
// local shortcut. See docs/experiment/README.md.
//
//   node scripts/experiment/chat.mjs modellen
//   node scripts/experiment/chat.mjs vraag "Wat bedoelt vraag 1.1.2?"
//   node scripts/experiment/chat.mjs gesprek
//   node scripts/experiment/chat.mjs toets 1.1.1
//
// It asks for a chat key, which you make in the web app (see login.mjs); the
// AIIA questions come from sources/aiia.yaml (see aiia.mjs).
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { ChatError, getKey } from './login.mjs'
import { buildReviewMessages, findTask, loadAiia } from './aiia.mjs'

export { ChatError, getKey } from './login.mjs'

export const API_URL = 'https://experiment-ai-3rt.rig.prd1.gn2.quattro.rijksapps.nl'

const DEFAULT_SYSTEM = 'Je helpt bij het invullen van het AIIA.'
// Mirror the server's bounds (apps/boekhouding-backend/src/routes/chat.ts).
const MAX_MESSAGES = 50
const MAX_CONTENT = 8000

const PRIVACY_NOTE = 'Je tekst gaat naar het taalmodel. Gebruik geen echte persoonsgegevens.'

const USAGE = `Gebruik:
  node scripts/experiment/chat.mjs modellen
  node scripts/experiment/chat.mjs vraag "<je vraag>"
  node scripts/experiment/chat.mjs gesprek
  node scripts/experiment/chat.mjs toets <vraagnummer>

Opties:
  --model <id>               een id uit 'modellen'; zonder: het standaardmodel van de omgeving
  --systeem "<instructie>"   eigen systeembericht; standaard: "${DEFAULT_SYSTEM}"
                             (bij toets: de beoordelingsinstructie uit aiia.mjs)
  --antwoord "<tekst>"       bij toets: het antwoord om te beoordelen
  --bestand <pad>            bij toets: lees het antwoord uit een bestand
  --bron <pad>               bij toets: een ander AIIA-bestand dan sources/aiia.yaml

Het script vraagt om een chat-sleutel; die maak je in de webapp op /chat-sleutel.
AIIA_API_URL kiest een ander API-adres; standaard ${API_URL}.`

// What the user should do about each status the chat route can return.
const STATUS_HINTS = {
  400: 'Ongeldig verzoek, of geen model gekozen. Geef --model mee (zie "modellen").',
  401: 'Chat-sleutel verlopen of ongeldig. Maak een nieuwe in de webapp op /chat-sleutel.',
  502: 'VLAM gaf een fout. Kies een ander model met --model.',
  503: 'Chat is niet geconfigureerd in deze omgeving.',
  504: 'VLAM antwoordde niet op tijd. Probeer het opnieuw of stel een kortere vraag.',
}

async function callApi(apiUrl, key, path, fetchImpl, init = {}) {
  let response
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${key}`, ...(init.body && { 'content-type': 'application/json' }) },
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

export const listModels = (apiUrl, key, fetchImpl) =>
  callApi(apiUrl, key, '/api/v1/chat/models', fetchImpl)

export const sendChat = (apiUrl, key, messages, model, fetchImpl) =>
  callApi(apiUrl, key, '/api/v1/chat', fetchImpl, {
    method: 'POST',
    body: JSON.stringify({ messages, ...(model && { model }) }),
  })

async function converse(apiUrl, key, options, io, fetchImpl) {
  // Iterating the interface (rather than question()) keeps lines that arrive
  // while a reply is pending, e.g. when input is piped in.
  const rl = createInterface({ input: io.stdin, terminal: false })
  const history = [{ role: 'system', content: options.systeem ?? DEFAULT_SYSTEM }]
  io.log(`Gesprek gestart. ${PRIVACY_NOTE}\nTyp je vraag; een lege regel of "stop" beëindigt het gesprek.`)
  io.stdout.write('\njij> ')
  try {
    for await (const line of rl) {
      if (!line.trim() || line.trim() === 'stop') break
      if (history.length + 2 > MAX_MESSAGES) {
        io.log(`Maximum van ${MAX_MESSAGES} berichten bereikt; start een nieuw gesprek.`)
        break
      }
      history.push({ role: 'user', content: line })
      const { reply, model } = await sendChat(apiUrl, key, history, options.model, fetchImpl)
      history.push({ role: 'assistant', content: reply })
      io.log(`\n${model}> ${reply}`)
      io.stdout.write('\njij> ')
    }
  } finally {
    rl.close()
  }
}

// The answer to review: from --antwoord, from --bestand, or typed in, ending
// with an empty line.
async function readAnswer(options, io) {
  if (options.antwoord) return options.antwoord
  if (options.bestand) {
    return readFile(options.bestand, 'utf8').catch(() => {
      throw new ChatError(`Bestand ${options.bestand} is niet te lezen.`)
    })
  }
  io.log('Typ of plak je antwoord en sluit af met een lege regel:')
  const rl = createInterface({ input: io.stdin, terminal: false })
  const lines = []
  try {
    for await (const line of rl) {
      if (!line.trim()) break
      lines.push(line)
    }
  } finally {
    rl.close()
  }
  return lines.join('\n')
}

async function review(apiUrl, key, id, options, io, fetchImpl) {
  const found = findTask(await loadAiia(options.bron), id)
  const answer = await readAnswer(options, io)
  if (!answer.trim()) throw new ChatError('Geen antwoord opgegeven; er is niets verstuurd.')
  const messages = buildReviewMessages(found, answer, options.systeem)
  if (messages[1].content.length > MAX_CONTENT) {
    throw new ChatError(`Vraag en antwoord zijn samen te lang (meer dan ${MAX_CONTENT} tekens); maak het antwoord korter.`)
  }
  io.log(`${PRIVACY_NOTE}\nAntwoord op vraag ${id} wordt beoordeeld...`)
  const { reply, model } = await sendChat(apiUrl, key, messages, options.model, fetchImpl)
  io.log(`\n${model}> ${reply}`)
}

export async function runCli(argv, { env = process.env, fetchImpl = fetch, io, readKey } = {}) {
  io ??= { stdin: process.stdin, stdout: process.stdout, log: console.log }
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: 'string' },
      systeem: { type: 'string' },
      antwoord: { type: 'string' },
      bestand: { type: 'string' },
      bron: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [command, ...rest] = positionals
  if (values.help || !command) {
    io.log(USAGE)
    return
  }
  if (!['modellen', 'vraag', 'gesprek', 'toets'].includes(command)) {
    throw new ChatError(`Onbekend commando "${command}".\n\n${USAGE}`)
  }
  const argument = rest.join(' ').trim()
  if (command === 'vraag' && !argument) {
    throw new ChatError('Geef een vraag mee, bijvoorbeeld: vraag "Wat bedoelt vraag 1.1.2?"')
  }
  if (command === 'toets' && !argument) {
    throw new ChatError('Geef een vraagnummer mee, bijvoorbeeld: toets 1.1.1')
  }
  // Check the question before asking for the key, so a typo costs no paste.
  if (command === 'toets') findTask(await loadAiia(values.bron), argument)

  const apiUrl = (env.AIIA_API_URL || API_URL).replace(/\/+$/, '')
  const key = await getKey(env, apiUrl, readKey)

  if (command === 'modellen') {
    const { models, defaultModel } = await listModels(apiUrl, key, fetchImpl)
    for (const id of models) io.log(id === defaultModel ? `${id}  (standaard)` : id)
    if (!defaultModel) io.log('\nGeen standaardmodel ingesteld: geef --model mee bij vraag, gesprek en toets.')
    return
  }
  if (command === 'vraag') {
    const messages = [
      { role: 'system', content: values.systeem ?? DEFAULT_SYSTEM },
      { role: 'user', content: argument },
    ]
    const { reply, model } = await sendChat(apiUrl, key, messages, values.model, fetchImpl)
    io.log(`${model}> ${reply}`)
    return
  }
  if (command === 'toets') return review(apiUrl, key, argument, values, io, fetchImpl)
  return converse(apiUrl, key, values, io, fetchImpl)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli(process.argv.slice(2)).catch((error) => {
    const known = error instanceof ChatError || error.code?.startsWith('ERR_PARSE_ARGS')
    console.error(known ? error.message : error)
    process.exitCode = 1
  })
}
