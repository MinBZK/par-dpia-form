import { PDFDocument, PDFName, PDFString, PDFHexString } from '@pdfme/pdf-lib'
import { parseAndValidateImport } from './importDetect'
import { type AssessmentState } from '../models/assessmentState'

// Extract a string value from a PDF Info dictionary. Custom Info keys can
// round-trip as either a PDFString or a PDFHexString depending on the writer,
// so both encodings must be decoded.
export function extractInfoStringValue(infoDict: unknown, key: string): string | undefined {
  if (!infoDict || typeof infoDict !== 'object' || !('lookup' in infoDict)) return undefined
  const dict = infoDict as { lookup(key: ReturnType<typeof PDFName.of>): unknown }
  const value = dict.lookup(PDFName.of(key))
  if (value instanceof PDFString) return value.decodeText()
  if (value instanceof PDFHexString) return value.decodeText()
  return undefined
}

async function toBytes(file: File | Blob | Uint8Array): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file
  return new Uint8Array(await file.arrayBuffer())
}

// Import a previously-exported PDF by reading the assessment-state JSON
// embedded in the PDF's Info dictionary (key `AssessmentData`, written by
// pdfExport.ts) and routing it through the shared import validation.
export async function importFromPdf(file: File | Blob | Uint8Array): Promise<AssessmentState> {
  const bytes = await toBytes(file)

  let pdfDoc
  try {
    pdfDoc = await PDFDocument.load(bytes)
  } catch {
    throw new Error('Het PDF-bestand is beschadigd of ongeldig.')
  }

  const infoRef = pdfDoc.context.trailerInfo.Info
  const infoDict = infoRef ? pdfDoc.context.lookup(infoRef) : undefined

  const raw = extractInfoStringValue(infoDict, 'AssessmentData')
  if (!raw) {
    throw new Error('PDF bevat geen assessment-gegevens')
  }

  return parseAndValidateImport(raw)
}
