declare module '*.png' {
  const src: string
  export default src
}

interface ImportMeta {
  glob(pattern: string | string[], options?: Record<string, unknown>): Record<string, unknown>
}
