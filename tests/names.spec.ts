import { isSkillName as registryIsSkillName } from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'

import { isSkillName } from '../src/names'

/**
 * The local grammar is a copy because installed plugins cannot resolve
 * `@deepseek-ai/*`. These cases fail as soon as the copy and core disagree.
 */
const CORPUS = [
  'a',
  'grilling',
  'mattpocock-skills-grilling',
  'a-b-c',
  '0',
  '9-lives',
  '',
  '-',
  '-lead',
  'trail-',
  'double--dash',
  'Upper',
  'with_underscore',
  'with.dot',
  'with space',
  'ns:skill',
  'grüße',
  'a-',
]

describe('skill-name grammar', () => {
  it('matches the registry grammar on every corpus entry', () => {
    for (const value of CORPUS) {
      expect(isSkillName(value), `local ${JSON.stringify(value)}`).toBe(registryIsSkillName(value))
    }
  })

  it('accepts canonical names built from a namespace and a skill', () => {
    expect(isSkillName('mattpocock-skills-grill-me')).toBe(true)
    expect(isSkillName('scratch-notes-anything-deep')).toBe(true)
  })
})
