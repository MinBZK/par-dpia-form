// The AIIA side of the experiment: find a question in sources/aiia.yaml and
// turn it, with an answer, into a conversation for the model. This is the place
// to start when you want the model to help in another way: write a new
// build...Messages next to buildReviewMessages and give it a command in chat.mjs.
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { ChatError } from './login.mjs'

export const AIIA_SOURCE = new URL('../../sources/aiia.yaml', import.meta.url)

export const REVIEW_SYSTEM = `Je beoordeelt antwoorden op vragen uit het AI Impact Assessment (AIIA) van de Nederlandse overheid.
Geef in het Nederlands, kort en zakelijk:
1. of het antwoord de vraag dekt: ja, deels of nee;
2. wat ontbreekt of onduidelijk is;
3. een concrete suggestie om het antwoord te verbeteren.
Verzin geen feiten over het AI-systeem. Ontbreekt informatie, benoem dan welke.`

export async function loadAiia(source = AIIA_SOURCE) {
  const text = await readFile(source, 'utf8').catch(() => {
    throw new ChatError(`AIIA-bestand ${source} is niet te lezen.`)
  })
  return parse(text)
}

/**
 * Find a question by its id ("1.1.2"), with the sections above it, from the
 * outermost down: the context a reader of the form sees around the question.
 */
export function findTask(aiia, id) {
  const walk = (tasks, parents) => {
    for (const task of tasks ?? []) {
      if (task.id === id) return { task, parents }
      const found = walk(task.tasks, [...parents, task])
      if (found) return found
    }
    return null
  }
  const found = walk(aiia.tasks, [])
  if (!found) throw new ChatError(`Vraag ${id} staat niet in het AIIA.`)
  if (found.task.type?.includes('task_group')) {
    const children = (found.task.tasks ?? []).map((child) => child.id).filter(Boolean)
    const hint = children.length ? ` Kies een vraag daarbinnen: ${children.join(', ')}.` : ''
    throw new ChatError(`${id} is een onderdeel, geen vraag.${hint}`)
  }
  return found
}

/** The question as a block of text: where it sits, what it asks, and its options. */
export function describeTask({ task, parents }) {
  const lines = [`Vraag ${task.id}: ${task.task.trim()}`]
  if (task.description) lines.push(`Toelichting: ${task.description.trim()}`)
  if (parents.length) lines.push(`Onderdeel: ${parents.map((parent) => parent.task.trim()).join(' > ')}`)
  const context = parents.at(-1)?.description
  if (context) lines.push(`Uitleg bij het onderdeel: ${context.trim()}`)
  if (task.options?.length) {
    lines.push(`Antwoordopties: ${task.options.map((option) => option.label ?? option.value).join('; ')}`)
  }
  return lines.join('\n')
}

/** A conversation that asks the model to review an answer to one question. */
export function buildReviewMessages(found, answer, system = REVIEW_SYSTEM) {
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${describeTask(found)}\n\nAntwoord:\n${answer.trim()}` },
  ]
}
