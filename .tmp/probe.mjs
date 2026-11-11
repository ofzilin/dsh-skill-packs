import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'

const installed = 'C:/Users/zhangzilin/.dsh/profiles/web/node_modules/dsh-skill-packs/lib/index.js'
const SkillPacks = await import(pathToFileURL(installed).href)

const ctx = new Context()
await ctx.plugin(SkillRegistry)
const fiber = await ctx.plugin(SkillPacks, { packRoot: join(homedir(), '.dsh', 'dsh-skill-packs') })
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
  contentEqual: ask?.content === injected,
  expectedLen: ask?.content.length,
  injectedLen: injected.length,
  invocation: ask?.invocation,
}, null, 2))
await fiber.dispose()
