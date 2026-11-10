import { existsSync } from 'node:fs'
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

  it('coexists with the flattened copy in the user skill root', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const names = new Set((await ctx.skills.list()).map((skill) => skill.name))
    expect(names.has('mattpocock-skills-grilling')).toBe(true)
    // The flat copy is a different provider's job; holding the same content
    // under two names is the documented coexistence (ADR 0005).
    expect(existsSync(join(homedir(), '.dsh', 'skills', 'grilling', 'SKILL.md'))).toBe(true)
    expect(names.has('grilling')).toBe(false)

    await fiber.dispose()
  })
})
