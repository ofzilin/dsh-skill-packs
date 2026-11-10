import { describe, expect, it } from 'vitest'

import { parseSkillFile } from '../src/frontmatter'

const VALID = [
  '---',
  'name: grilling',
  'description: "Grill the user relentlessly."',
  '---',
  '',
  '# Grilling',
  '',
  'Body text.',
  '',
].join('\n')

describe('SKILL.md frontmatter', () => {
  it('parses name, description and the body', () => {
    const result = parseSkillFile(VALID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skill.name).toBe('grilling')
    expect(result.skill.description).toBe('Grill the user relentlessly.')
    expect(result.skill.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(result.body).toContain('# Grilling')
    expect(result.body).not.toContain('---')
  })

  it('honors disable-model-invocation and user-invocable', () => {
    const result = parseSkillFile(
      [
        '---',
        'name: grill-me',
        'description: "Shortcut."',
        'disable-model-invocation: true',
        'user-invocable: false',
        '---',
        '',
      ].join('\n'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skill.invocation).toEqual({ modelInvocable: false, userInvocable: false })
  })

  it('accepts loose boolean spellings, like core does', () => {
    const result = parseSkillFile(
      ['---', 'name: a', 'description: "d"', 'disable-model-invocation: "yes"', '---', ''].join('\n'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skill.invocation.modelInvocable).toBe(false)
  })

  it('rejects legacy camelCase invocation keys', () => {
    const result = parseSkillFile(
      ['---', 'name: a', 'description: "d"', 'disableModelInvocation: true', '---', ''].join('\n'),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('disable-model-invocation')
  })

  it('requires both name and description', () => {
    const missingDescription = parseSkillFile(['---', 'name: a', '---', ''].join('\n'))
    expect(missingDescription.ok).toBe(false)
    if (missingDescription.ok) return
    expect(missingDescription.reason).toContain('name and description')
  })

  it('rejects a file without frontmatter or with unclosed frontmatter', () => {
    expect(parseSkillFile('# Just a body\n').ok).toBe(false)
    expect(parseSkillFile(['---', 'name: a', 'description: "d"'].join('\n')).ok).toBe(false)
  })

  it('rejects invalid YAML', () => {
    const result = parseSkillFile(['---', 'name: [a', 'description: "d"', '---', ''].join('\n'))
    expect(result.ok).toBe(false)
  })

  it('keeps whenToUse and metadata', () => {
    const result = parseSkillFile(
      [
        '---',
        'name: a',
        'description: "d"',
        'whenToUse: "when testing"',
        'metadata:',
        '  category: test',
        '---',
        '',
      ].join('\n'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skill.whenToUse).toBe('when testing')
    expect(result.skill.metadata).toEqual({ category: 'test' })
  })
})
