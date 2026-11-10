import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'

import * as SkillPacks from '../src/index'
import { makeTempRoot, skillMarkdown, writeTree } from './helpers'

async function armedContext() {
  const packRoot = await makeTempRoot()
  await writeTree(packRoot, {
    'settings.json': JSON.stringify({ 'demo-pack': true }),
    'demo-pack/.claude-plugin/plugin.json': JSON.stringify({ name: 'demo-pack' }),
    'demo-pack/skills/greeting/SKILL.md': skillMarkdown({
      name: 'greeting',
      description: 'Say hello',
    }),
    'demo-pack/skills/muted/SKILL.md': skillMarkdown({
      name: 'muted',
      description: 'Model should not see this',
      'disable-model-invocation': true,
    }),
  })

  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const fiber = await ctx.plugin(SkillPacks, { packRoot })
  return { ctx, fiber, packRoot }
}

describe('provider through the real registry', () => {
  it('contributes namespaced skills and removes them on dispose', async () => {
    const { ctx, fiber } = await armedContext()

    const listed = await ctx.skills.list()
    expect(new Set(listed.map((skill) => skill.name))).toEqual(
      new Set(['demo-pack-greeting', 'demo-pack-muted']),
    )
    for (const skill of listed) {
      expect(skill.provider).toBe('skill-packs')
      expect(skill.source).toBe('skill-packs')
    }

    const loaded = await ctx.skills.get('demo-pack-greeting')
    expect(loaded?.content).toContain('# Body')
    expect(loaded?.path).toMatch(/SKILL\.md$/)
    expect(loaded?.resourceBase?.kind).toBe('directory')

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('preserves the frontmatter invocation policy', async () => {
    const { ctx, fiber } = await armedContext()
    const listed = await ctx.skills.list()
    const muted = listed.find((skill) => skill.name === 'demo-pack-muted')
    expect(muted?.invocation).toEqual({ modelInvocable: false, userInvocable: true })
    await fiber.dispose()
  })

  it('returns undefined for a body that disappeared after listing', async () => {
    const { ctx, fiber, packRoot } = await armedContext()
    const listed = await ctx.skills.list()
    const greeting = listed.find((skill) => skill.name === 'demo-pack-greeting')
    expect(greeting).toBeDefined()

    const { rm } = await import('node:fs/promises')
    await rm(`${packRoot}/demo-pack/skills/greeting/SKILL.md`)
    expect(await ctx.skills.get('demo-pack-greeting')).toBeUndefined()
    await fiber.dispose()
  })

  it('does not throw the whole catalog when one pack is broken', async () => {
    const packRoot = await makeTempRoot()
    await writeTree(packRoot, {
      'settings.json': JSON.stringify({ good: true, bad: true }),
      'good/.claude-plugin/plugin.json': JSON.stringify({ name: 'good' }),
      'good/skills/x/SKILL.md': skillMarkdown({ name: 'x', description: 'Good' }),
      'bad/.claude-plugin/plugin.json': '{ not json',
      'bad/skills/y/SKILL.md': skillMarkdown({ name: 'y', description: 'Y' }),
    })

    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    const listed = await ctx.skills.list()
    expect(listed.map((skill) => skill.name)).toEqual(['good-x'])
    await fiber.dispose()
  })
})
