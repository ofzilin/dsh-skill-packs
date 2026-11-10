import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'

import * as SkillPacks from '../src/index'
import { makeTempRoot, skillMarkdown, writeTree } from './helpers'

async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 8000): Promise<T> {
  const startedAt = Date.now()
  for (;;) {
    const value = await probe()
    if (value !== undefined) return value
    if (Date.now() - startedAt > timeoutMs) throw new Error('timed out waiting for the watcher')
    await delay(50)
  }
}

describe('pack-root watcher', () => {
  it('picks up a pack cloned while the session is already running', async () => {
    const packRoot = await makeTempRoot()
    await writeFile(join(packRoot, 'settings.json'), JSON.stringify({ late: true }), 'utf8')

    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })

    expect(await ctx.skills.list()).toEqual([])

    await writeTree(packRoot, {
      'late/.claude-plugin/plugin.json': JSON.stringify({ name: 'late' }),
      'late/skills/x/SKILL.md': skillMarkdown({ name: 'x', description: 'Late pack' }),
    })

    const names = await waitFor(async () => {
      const listed = await ctx.skills.list()
      return listed.length > 0 ? listed.map((skill) => skill.name) : undefined
    })
    expect(names).toEqual(['late-x'])

    await fiber.dispose()
  }, 20_000)

  it('notices a skill added to an already-enabled pack', async () => {
    const packRoot = await makeTempRoot()
    await writeTree(packRoot, {
      'settings.json': JSON.stringify({ demo: true }),
      'demo/.claude-plugin/plugin.json': JSON.stringify({ name: 'demo' }),
      'demo/skills/first/SKILL.md': skillMarkdown({ name: 'first', description: 'First' }),
    })

    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillPacks, { packRoot })
    expect((await ctx.skills.list()).map((skill) => skill.name)).toEqual(['demo-first'])

    await writeTree(packRoot, {
      'demo/skills/second/SKILL.md': skillMarkdown({ name: 'second', description: 'Second' }),
    })

    const names = await waitFor(async () => {
      const listed = (await ctx.skills.list()).map((skill) => skill.name)
      return listed.length === 2 ? listed : undefined
    })
    expect(new Set(names)).toEqual(new Set(['demo-first', 'demo-second']))

    await fiber.dispose()
  }, 20_000)
})
