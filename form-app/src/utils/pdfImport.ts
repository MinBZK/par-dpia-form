import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { FormType } from '@/models/dpia.ts'

function extractInfoStringValue(infoDict: unknown, key: string): string | undefined {
  if (!infoDict || typeof infoDict !== 'object' || !('lookup' in infoDict)) return undefined
  const dict = infoDict as { lookup(key: ReturnType<typeof PDFName.of>): unknown }
  const value = dict.lookup(PDFName.of(key))
  if (value instanceof PDFString) return value.decodeText()
  if (value instanceof PDFHexString) return value.decodeText()
  return undefined
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Het bestand kon niet worden gelezen.'))
    reader.readAsArrayBuffer(file)
  })
}

export async function importFromPdf(file: File): Promise<DPIASnapshot> {
  const arrayBuffer = await readFileAsArrayBuffer(file)

  let pdfDoc
  try {
    pdfDoc = await PDFDocument.load(arrayBuffer)
  } catch {
    throw new Error('Het PDF-bestand is beschadigd of ongeldig.')
  }

  const infoRef = pdfDoc.context.trailerInfo.Info
  if (!infoRef) {
    throw new Error('Dit PDF-bestand bevat geen DPIA-gegevens.')
  }

  const infoDict = pdfDoc.context.lookup(infoRef)

  const dpiaDataRaw = extractInfoStringValue(infoDict, 'DPIAData')
  if (!dpiaDataRaw) {
    throw new Error('Dit PDF-bestand bevat geen DPIA-gegevens.')
  }

  let data: DPIASnapshot
  try {
    data = JSON.parse(dpiaDataRaw) as DPIASnapshot
  } catch {
    throw new Error(
      'Dit PDF-bestand is aangepast nadat het is geëxporteerd. De gegevens kunnen niet betrouwbaar worden ingelezen.',
    )
  }

  if (!data.metadata || !data.taskState || !data.answers) {
    throw new Error(
      'Dit PDF-bestand is aangepast nadat het is geëxporteerd. De gegevens kunnen niet betrouwbaar worden ingelezen.',
    )
  }

  const hasDPIA = data.taskState[FormType.DPIA] && data.answers[FormType.DPIA]
  const hasPreScan = data.taskState[FormType.PRE_SCAN] && data.answers[FormType.PRE_SCAN]

  if (!hasDPIA && !hasPreScan) {
    throw new Error('Het bestand bevat geen geldige DPIA- of pre-scan-gegevens.')
  }

  return data
}
