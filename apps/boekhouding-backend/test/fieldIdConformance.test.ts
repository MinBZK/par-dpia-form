import { describe, it, expect } from 'vitest'
import * as backend from '../src/utils/fieldId.js'
import * as core from '../../../packages/assessment-core/src/utils/fieldUrn'
import * as coreInstanceId from '../../../packages/assessment-core/src/utils/instanceId'
import { FormType } from '../../../packages/assessment-core/src/models/dpia'

/**
 * The field identifier format lives in two places: here and in assessment-core.
 * The backend cannot import the core package (it ships Vue and unbuilt TypeScript,
 * and the backend container copies only apps/boekhouding-backend), so the copies
 * are kept honest by this test instead of by the module system. Anything that
 * changes one implementation has to change the other, or this fails.
 */

const INSTANCE_IDS = [
  '0.1',
  '2.1.3',
  '2.1.3[0]',
  '2.1.3[12]',
  '2.1.3[abc]',
  'completed.1',
  'completed.2.1',
  'foo[1]',
  '',
]

const URNS = ['urn:nl:dpia:3.0', 'urn:nl:prescan_dpia:2.0', 'urn:nl:iama:1.0']

const FIELD_IDS = [
  'urn:nl:dpia:3.0?=task_id=2.1.3',
  'urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0',
  'urn:nl:dpia:3.0?=task_id=2.1.3&task_index=12',
  'urn:nl:dpia:3.0?=task_id=completed.1',
  'urn:nl:prescan_dpia:2.0?=task_id=1.1',
  'urn:nl:iama:1.0?=task_id=3.2&task_index=1',
  'urn:nl:dpia:3.0',
  'urn:nl:dpia:3.0?=task=2.1.3',
  'urn:garbage',
  'dpia.2.1.3',
  'prescan.1.1',
  'iama.2.1',
  '2.1.3',
  '2.1.3[0]',
  'completed.1',
  '',
]

describe('field id conformance with assessment-core', () => {
  it('parses instance ids identically', () => {
    for (const id of INSTANCE_IDS) {
      expect(backend.parseInstanceId(id), id).toEqual(coreInstanceId.parseInstanceId(id))
    }
  })

  it('builds instance ids identically', () => {
    for (const { taskId, index } of INSTANCE_IDS.map(backend.parseInstanceId)) {
      expect(backend.buildInstanceId(taskId, index), taskId).toBe(
        coreInstanceId.buildInstanceId(taskId, index),
      )
    }
  })

  it('builds field URNs identically', () => {
    for (const urn of URNS) {
      for (const id of INSTANCE_IDS) {
        expect(backend.buildFieldUrn(urn, id), `${urn} ${id}`).toBe(core.buildFieldUrn(urn, id))
      }
    }
  })

  it('parses field ids identically', () => {
    for (const fieldId of FIELD_IDS) {
      expect(backend.parseFieldUrn(fieldId), fieldId).toEqual(core.parseFieldUrn(fieldId))
    }
  })

  it('reads the dot format for every assessment core knows about', () => {
    // Core derives its namespace list from FormType; this copy spells it out, so
    // a new assessment that only lands in the enum fails here instead of quietly
    // making its version history unrestorable.
    for (const namespace of Object.values(FormType)) {
      const fieldId = `${namespace}.2.1.3`
      expect(backend.parseFieldUrn(fieldId), fieldId).toEqual({ namespace, key: '2.1.3' })
      expect(backend.parseFieldUrn(fieldId), fieldId).toEqual(core.parseFieldUrn(fieldId))
    }
  })

  it('round-trips every instance id through a field URN', () => {
    // An empty task id has no URN to round-trip through: "?=task_id=" is malformed.
    for (const id of INSTANCE_IDS.filter(Boolean)) {
      const fieldId = backend.buildFieldUrn('urn:nl:dpia:3.0', id)
      expect(backend.parseFieldUrn(fieldId)?.key, id).toBe(id)
    }
  })
})
