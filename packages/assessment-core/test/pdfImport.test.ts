import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, PDFString, PDFHexString } from '@pdfme/pdf-lib'
import { importFromPdf, extractInfoStringValue } from '../src/utils/pdfImport'
import { type AssessmentState } from '../src/models/assessmentState'

// Build a minimal in-memory PDF whose Info dictionary carries the
// `AssessmentData` key, mirroring what pdfExport.ts writes via pdfmake.
async function buildPdfWithAssessmentData(
  value: string,
  encode: (raw: string) => PDFString | PDFHexString = (raw) => PDFString.of(raw),
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.addPage()

  const infoRef = pdfDoc.context.trailerInfo.Info
  const infoDict = pdfDoc.context.lookup(infoRef) as ReturnType<
    typeof pdfDoc.context.obj
  > & { set(key: ReturnType<typeof PDFName.of>, value: unknown): void }

  infoDict.set(PDFName.of('AssessmentData'), encode(value))

  return pdfDoc.save()
}

const sampleState: AssessmentState = {
  metadata: { urn: 'urn:nl:iama', createdAt: '2026-06-06T12:00:00.000Z' },
  answers: { '1.1': { value: 'x' } },
}

describe('importFromPdf', () => {
  it('reads the AssessmentData JSON from the PDF Info dict and validates it (IAMA)', async () => {
    const bytes = await buildPdfWithAssessmentData(JSON.stringify(sampleState))

    const result = await importFromPdf(bytes)

    expect(result.metadata.urn).toBe('urn:nl:iama')
    expect(result.answers['1.1']).toEqual({ value: 'x' })
  })

  it('accepts a Blob input', async () => {
    const bytes = await buildPdfWithAssessmentData(JSON.stringify(sampleState))
    const blob = new Blob([bytes], { type: 'application/pdf' })

    const result = await importFromPdf(blob)

    expect(result.metadata.urn).toBe('urn:nl:iama')
    expect(result.answers['1.1']).toEqual({ value: 'x' })
  })

  it('decodes an Info value stored as a PDFHexString', async () => {
    // Custom Info keys can round-trip as either PDFString or PDFHexString
    // depending on the writer; importFromPdf must handle the hex path too.
    const bytes = await buildPdfWithAssessmentData(
      JSON.stringify(sampleState),
      (raw) => PDFHexString.fromText(raw),
    )

    const result = await importFromPdf(bytes)

    expect(result.metadata.urn).toBe('urn:nl:iama')
    expect(result.answers['1.1']).toEqual({ value: 'x' })
  })

  it('rejects a PDF whose AssessmentData is not valid JSON', async () => {
    const bytes = await buildPdfWithAssessmentData('dit is geen json')

    await expect(importFromPdf(bytes)).rejects.toThrow('Ongeldig JSON-bestand')
  })

  it('rejects a PDF without an AssessmentData key', async () => {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.addPage()
    const bytes = await pdfDoc.save()

    await expect(importFromPdf(bytes)).rejects.toThrow(/assessment-gegevens/)
  })
})

describe('extractInfoStringValue', () => {
  it('decodes a PDFString value', async () => {
    const pdfDoc = await PDFDocument.create()
    const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info) as {
      set(key: ReturnType<typeof PDFName.of>, value: unknown): void
    }
    infoDict.set(PDFName.of('AssessmentData'), PDFString.of('hello'))

    expect(extractInfoStringValue(infoDict, 'AssessmentData')).toBe('hello')
  })

  it('decodes a PDFHexString value', async () => {
    const pdfDoc = await PDFDocument.create()
    const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info) as {
      set(key: ReturnType<typeof PDFName.of>, value: unknown): void
    }
    infoDict.set(PDFName.of('AssessmentData'), PDFHexString.fromText('héllo'))

    expect(extractInfoStringValue(infoDict, 'AssessmentData')).toBe('héllo')
  })

  it('returns undefined for a missing key', async () => {
    const pdfDoc = await PDFDocument.create()
    const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info)

    expect(extractInfoStringValue(infoDict, 'AssessmentData')).toBeUndefined()
  })
})
