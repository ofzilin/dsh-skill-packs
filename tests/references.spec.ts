import { describe, expect, it } from 'vitest'

import { applyReferencePolicy, type SiblingSkill } from '../src/references'

const SIBLINGS: readonly SiblingSkill[] = [
  { name: 'grilling', canonical: 'mattpocock-skills-grilling', modelInvocable: true, userInvocable: true },
  { name: 'domain-modeling', canonical: 'mattpocock-skills-domain-modeling', modelInvocable: true, userInvocable: true },
  { name: 'triage', canonical: 'mattpocock-skills-triage', modelInvocable: false, userInvocable: true },
]

const run = (body: string, mode: 'both' | 'note' | 'rewrite' | 'off' = 'both') =>
  applyReferencePolicy({
    body,
    namespace: 'mattpocock-skills',
    self: 'mattpocock-skills-grill-with-docs',
    siblings: SIBLINGS,
    mode,
  })

describe('reference policy', () => {
  it('rewrites quoted Skill-tool references on a skill line', () => {
    const result = run('Call the Skill tool twice, for "grilling" and "domain-modeling".\n')
    expect(result.content).toBe(
      'Call the Skill tool twice, for "mattpocock-skills-grilling" and "mattpocock-skills-domain-modeling".\n',
    )
    expect(result.residual).toEqual([])
  })

  it('leaves bare prose words alone', () => {
    const result = run('Before any grilling, check that the claim holds up.\n')
    expect(result.content).toContain('Before any grilling')
    expect(result.rewritten).toBe(0)
  })

  it('rewrites slash gestures, including inside backticks', () => {
    const result = run('- **`/triage`** moves issues through triage roles.\n')
    expect(result.content).toContain('**`/mattpocock-skills-triage`**')
    expect(result.content).toContain('triage roles')
  })

  it('does not rewrite a quoted name on a line that never mentions a skill', () => {
    const result = run('Each ticket carries a "grilling" label.\n')
    // The line has no `skill` word, so the quote rule stays out; the bare name
    // survives, which is exactly when the namespace rule is added.
    expect(result.content).toContain('Each ticket carries a "grilling" label.')
    expect(result.content).not.toContain('"mattpocock-skills-grilling"')
  })

  it('does not rewrite backticked label values', () => {
    const result = run('One of `research`, `grilling`, `task`.\n')
    // The label list is untouched; the canonical name only appears in the rule itself.
    expect(result.content).toContain('One of `research`, `grilling`, `task`.')
    expect(result.content.split('\n').at(-2)).toBe('One of `research`, `grilling`, `task`.')
  })

  it('prepends the namespace rule only when a bare name survives', () => {
    const residualOn = run('Use grilling to sharpen this.\nCall the Skill tool with "grilling".\n')
    expect(residualOn.content.startsWith('> **Pack namespace.**')).toBe(true)
    // One contiguous blockquote line: no stray "> " markers inside the sentence.
    expect(residualOn.content).toContain('same-pack skills referenced here')
    expect(residualOn.content.split('\n')[0]).not.toContain(' > ')
    expect(residualOn.content).toContain('`grilling`')
    expect(residualOn.content).toContain('"mattpocock-skills-grilling"')

    const residualOff = run('Call the Skill tool with "grilling".\n')
    expect(residualOff.content.startsWith('> **Pack namespace.**')).toBe(false)
  })

  it('never rewrites a quoted reference to a model-disabled sibling', () => {
    const result = run('Call the Skill tool with "triage" if needed.\n')
    // `triage` is user-invocable only; quoting it to the model would invite a failing call.
    expect(result.content).toContain('"triage"')
    expect(result.content).not.toContain('"mattpocock-skills-triage"')
  })

  it('leaves already-prefixed names alone', () => {
    const result = run('Load `mattpocock-skills-grilling` directly.\n')
    expect(result.content).toBe('Load `mattpocock-skills-grilling` directly.\n')
  })

  it('note mode never rewrites but still explains bare names', () => {
    const result = run('Call the Skill tool with "grilling".\n', 'note')
    expect(result.content).toContain('"grilling"')
    expect(result.content.startsWith('> **Pack namespace.**')).toBe(true)
  })

  it('off mode returns the body untouched', () => {
    const body = 'Call the Skill tool with "grilling".\n'
    expect(run(body, 'off').content).toBe(body)
  })

  it('ignores the skill itself', () => {
    const result = run('Call the Skill tool with "grill-with-docs".\n')
    expect(result.content).toBe('Call the Skill tool with "grill-with-docs".\n')
  })
})
