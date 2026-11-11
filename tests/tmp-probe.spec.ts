import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { it } from 'vitest'

import * as SkillPacks from '../src/index'

const packRoot = join(homedir(), '.dsh', 'dsh-skill-packs')

it('probe', async () => {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const fiber = await ctx.plugin(SkillPacks, { packRoot })
  const listed = await ctx.skills.list()
  const model = listed.filter((s) => s.invocation.modelInvocable).map((s) => s.name).sort()
  const ask = await ctx.skills.get('mattpocock-skills-ask-matt')
  const injected = readFileSync('.tmp/injected.md', 'utf8')
  writeFileSync('.tmp/expected.md', ask?.content ?? '')
  console.log(JSON.stringify({
    total: listed.length,
    modelCount: model.length,
    model,
    askFound: ask !== undefined,
    askName: ask?.name,
    contentEqual: ask?.content === injected,
    expectedLen: ask?.content.length,
    injectedLen: injected.length,
    askInvocation: ask?.invocation,
  }, null, 2))
  await fiber.dispose()
})
