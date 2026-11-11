import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'

import * as SkillPacks from '../src/index'

/**
 * Acceptance against a real Claude plugin repository. Runs only when the pack
 * has been cloned into the user-level pack root:
 *
 *   git clone https://github.com/mattpocock/skills ~/.dsh/dsh-skill-packs/mattpocock-skills
 *   echo '{ "mattpocock-skills": true }' > ~/.dsh/dsh-skill-packs/settings.json
 */
const packRoot = process.env.DSH_SKILL_PACK_ROOT ?? join(homedir(), '.dsh', 'dsh-skill-packs')
const enabled = existsSync(join(packRoot, 'mattpocock-skills', '.claude-plugin', 'plugin.json'))

/** Reference assertions assume the default policy; a user override changes them. */
const configuredMode = ((): string => {
  try {
    const parsed = JSON.parse(readFileSync(join(packRoot, 'config.json'), 'utf8')) as {
      readonly references?: { readonly mode?: string }
      readonly packs?: Readonly<Record<string, { readonly mode?: string }>>
    }
    return parsed.packs?.['mattpocock-skills']?.mode ?? parsed.references?.mode ?? 'both'
  } catch {
    return 'both'
  }
})()

describe.skipIf(!enabled)('mattpocock/skills as a compat pack', () => {
  it('exposes exactly the 27 skills listed in plugin.json', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const listed = await ctx.skills.list()
    const names = listed.map((skill) => skill.name).sort()

    expect(names).toHaveLength(27)
    for (const name of names) expect(name.startsWith('mattpocock-skills-')).toBe(true)

    expect(names).toContain('mattpocock-skills-grilling')
    expect(names).toContain('mattpocock-skills-grill-me')
    expect(names).toContain('mattpocock-skills-tdd')

    await fiber.dispose()
  })

  it('never expands directories that plugin.json does not list', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const names = new Set((await ctx.skills.list()).map((skill) => skill.name))
    // skills/in-progress, skills/misc and skills/deprecated all contain SKILL.md
    // files that this pack deliberately does not expose.
    for (const unlisted of [
      'mattpocock-skills-chief-of-staff',
      'mattpocock-skills-software-factory',
      'mattpocock-skills-git-guardrails-claude-code',
      'mattpocock-skills-scaffold-exercises',
    ]) {
      expect(names.has(unlisted)).toBe(false)
    }

    await fiber.dispose()
  })

  it('maps disable-model-invocation onto the invocation policy', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const listed = await ctx.skills.list()
    const byName = new Map(listed.map((skill) => [skill.name, skill]))

    expect(byName.get('mattpocock-skills-grill-me')?.invocation).toEqual({
      modelInvocable: false,
      userInvocable: true,
    })
    expect(byName.get('mattpocock-skills-grilling')?.invocation).toEqual({
      modelInvocable: true,
      userInvocable: true,
    })

    await fiber.dispose()
  })

  it('loads a body lazily from the nested skill directory', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const loaded = await ctx.skills.get('mattpocock-skills-grilling')
    expect(loaded?.content.length).toBeGreaterThan(100)
    expect(loaded?.path?.replaceAll('\\', '/')).toContain(
      'mattpocock-skills/skills/productivity/grilling/SKILL.md',
    )

    await fiber.dispose()
  })

  it.skipIf(configuredMode !== 'both')('rewrites sibling references and explains surviving bare names', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    // grill-with-docs quotes both siblings in a Skill-tool instruction, so both
    // are rewritten and no namespace rule is needed.
    const grill = await ctx.skills.get('mattpocock-skills-grill-with-docs')
    expect(grill?.content).toContain('"mattpocock-skills-grilling"')
    expect(grill?.content).toContain('"mattpocock-skills-domain-modeling"')
    expect(grill?.content.startsWith('> **Pack namespace.**')).toBe(false)

    // triage also mentions grilling as prose, so the surviving bare name earns
    // the namespace rule while the quoted tool references are still rewritten.
    const triage = await ctx.skills.get('mattpocock-skills-triage')
    expect(triage?.content.startsWith('> **Pack namespace.**')).toBe(true)
    expect(triage?.content).toContain('"mattpocock-skills-grilling"')

    await fiber.dispose()
  })

  it('coexists with a flattened copy when one is installed', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const names = new Set((await ctx.skills.list()).map((skill) => skill.name))
    expect(names.has('mattpocock-skills-grilling')).toBe(true)
    // A flat copy is another provider's business; holding the same content under
    // two names is the documented coexistence (ADR 0005). This provider only
    // contributes the namespaced name either way.
    expect(names.has('grilling')).toBe(false)

    await fiber.dispose()
  })
})
