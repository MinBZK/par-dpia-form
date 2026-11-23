//this is for testing purposes!!
/// <reference types="vite/client" />

declare module '@experiment/aiia' {
  export function buildReformulationMessages(
    found: {
      task: { id: string; task: string; description?: string }
      parents: { task: string; description?: string }[]
    },
    answer: string,
    system?: string,
  ): { role: 'system' | 'user'; content: string }[]
}
//this is for testing purposes!!
