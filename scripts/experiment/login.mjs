// Getting in: the script uses a chat key, which you make in the web app on the
// page /chat-sleutel. The API takes that key on its chat routes only, and it
// expires within hours, so it never opens your projects. It is read hidden and
// never stored.
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

export class ChatError extends Error {}

// Reads one line without echoing it, so a pasted key stays off the screen.
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

/**
 * The chat key: from AIIA_KEY, or pasted when asked. A "Bearer " prefix, as a
 * browser shows it, is dropped.
 */
export async function getKey(env, apiUrl, readKey = readHidden) {
  const raw = env.AIIA_KEY || (await readKey(`Plak je chat-sleutel (maak er een op ${apiUrl}/chat-sleutel): `))
  const key = raw.replace(/^Bearer\s+/i, '').trim()
  if (!key) throw new ChatError(`Geen chat-sleutel opgegeven. Maak er een op ${apiUrl}/chat-sleutel.`)
  return key
}
