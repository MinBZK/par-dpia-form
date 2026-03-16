import { describe, it, expect } from 'vitest'
import { assessmentInstances, assessmentVersions, assessmentEdits } from '../src/db/schema.js'

describe('database schema', () => {
  describe('assessmentInstances', () => {
    it('has a cachedState column', () => {
      expect(assessmentInstances.cachedState).toBeDefined()
      expect(assessmentInstances.cachedState.name).toBe('cached_state')
    })

    it('has a currentVersion column with default 1', () => {
      expect(assessmentInstances.currentVersion).toBeDefined()
      expect(assessmentInstances.currentVersion.name).toBe('current_version')
    })
  })

  describe('assessmentVersions', () => {
    it('does not have a state column (state is rebuilt from edits)', () => {
      expect((assessmentVersions as any).state).toBeUndefined()
      expect((assessmentVersions as any).snapshot).toBeUndefined()
    })
  })

  describe('assessmentEdits', () => {
    it('has an editType column with default answer_change', () => {
      expect(assessmentEdits.editType).toBeDefined()
      expect(assessmentEdits.editType.name).toBe('edit_type')
    })

    it('has assessmentVersionId FK (not a bare version integer)', () => {
      expect(assessmentEdits.assessmentVersionId).toBeDefined()
      expect(assessmentEdits.assessmentVersionId.name).toBe('assessment_version_id')
      expect((assessmentEdits as any).version).toBeUndefined()
    })

    it('does not have redundant assessmentInstanceId (derived via version FK)', () => {
      expect((assessmentEdits as any).assessmentInstanceId).toBeUndefined()
    })

    it('has editedBy column (not userId)', () => {
      expect(assessmentEdits.editedBy).toBeDefined()
      expect(assessmentEdits.editedBy.name).toBe('edited_by')
      expect((assessmentEdits as any).userId).toBeUndefined()
    })
  })
})
