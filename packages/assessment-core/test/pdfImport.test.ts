import { describe, it, expect, vi } from 'vitest'
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

  it('rejects a PDF whose trailer has no Info reference (infoRef falsy branch)', async () => {
    // A loaded PDF without an Info entry in the trailer -> infoRef is undefined
    // -> infoDict stays undefined -> "geen assessment-gegevens".
    const fakeDoc = {
      context: {
        trailerInfo: {}, // no Info
        lookup: () => undefined,
      },
    }
    const loadSpy = vi
      .spyOn(PDFDocument, 'load')
      .mockResolvedValue(fakeDoc as unknown as PDFDocument)

    await expect(importFromPdf(new Uint8Array([0]))).rejects.toThrow(
      /assessment-gegevens/,
    )

    loadSpy.mockRestore()
  })

  it('rejects a corrupt/invalid PDF (PDFDocument.load throws)', async () => {
    // Bytes that are not a valid PDF -> PDFDocument.load throws -> caught and
    // rethrown as a Dutch error message.
    const garbage = new Uint8Array([1, 2, 3, 4, 5])

    await expect(importFromPdf(garbage)).rejects.toThrow(
      'Het PDF-bestand is beschadigd of ongeldig.',
    )
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

  it('returns undefined when the info dictionary is null/undefined', () => {
    expect(extractInfoStringValue(undefined, 'AssessmentData')).toBeUndefined()
    expect(extractInfoStringValue(null, 'AssessmentData')).toBeUndefined()
  })

  it('returns undefined when the info dictionary is not an object', () => {
    expect(extractInfoStringValue('niet een object', 'AssessmentData')).toBeUndefined()
  })

  it('returns undefined when the object has no lookup method', () => {
    expect(extractInfoStringValue({ foo: 'bar' }, 'AssessmentData')).toBeUndefined()
  })

  it('returns undefined when the looked-up value is neither PDFString nor PDFHexString', () => {
    // An object exposing lookup() that returns a non-string PDF value exercises
    // the final `return undefined` fall-through.
    const fakeDict = { lookup: () => ({ some: 'other-pdf-object' }) }
    expect(extractInfoStringValue(fakeDict, 'AssessmentData')).toBeUndefined()
  })
})
