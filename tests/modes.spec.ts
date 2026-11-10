import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { scanPacks } from '../src/packs'
import { readEnableTable } from '../src/settings'
import { makeTempRoot, skillMarkdown, writeTree } from './helpers'

async function makeFixture(): Promise<string> {
  const root = await makeTempRoot()
  await writeTree(root, {
    'settings.json': JSON.stringify({
      'compat-pack': true,
      'manifest-pack': true,
      'discovery-pack': true,
      'marketplace-pack': true,
      'both-pack': true,
      'broken-pack': true,
    }),

    'compat-pack/.claude-plugin/plugin.json': JSON.stringify({
      name: 'compat-pack',
      skills: ['./skills/engineering/alpha', './skills/engineering/beta'],
    }),
    'compat-pack/skills/engineering/alpha/SKILL.md': skillMarkdown({
      name: 'alpha',
      description: 'Alpha skill',
    }),
    'compat-pack/skills/engineering/beta/SKILL.md': skillMarkdown({
      name: 'beta',
      description: 'Beta skill',
      'disable-model-invocation': true,
    }),
    'compat-pack/skills/loose/SKILL.md': skillMarkdown({ name: 'loose', description: 'Loose skill' }),
    'compat-pack/skills/category/nested/SKILL.md': skillMarkdown({
      name: 'nested',
      description: 'Not listed, two levels deep',
    }),

    'manifest-pack/.skill-pack/skills.json': JSON.stringify({
      name: 'My Team',
      skills: ['./skills/release'],
    }),
    'manifest-pack/skills/release/SKILL.md': skillMarkdown({
      name: 'release',
      description: 'Release skill',
    }),
    'manifest-pack/skills/extra/SKILL.md': skillMarkdown({ name: 'extra', description: 'Not listed' }),

    'discovery-pack/deep/nested/SKILL.md': skillMarkdown({
      name: 'deep-skill',
      description: 'Deep skill',
    }),
    'discovery-pack/node_modules/pkg/SKILL.md': skillMarkdown({ name: 'node-mod', description: 'Ignored' }),
    'discovery-pack/.hidden/SKILL.md': skillMarkdown({ name: 'hidden-skill', description: 'Ignored' }),
    'discovery-pack/dist/SKILL.md': skillMarkdown({ name: 'built', description: 'Ignored' }),

    'marketplace-pack/.claude-plugin/marketplace.json': JSON.stringify({ plugins: [] }),
    'marketplace-pack/skills/x/SKILL.md': skillMarkdown({ name: 'x', description: 'Not expanded' }),

    'both-pack/.claude-plugin/plugin.json': JSON.stringify({ name: 'both-pack' }),
    'both-pack/.skill-pack/skills.json': JSON.stringify({ name: 'both-wins', skills: ['./skills/only'] }),
    'both-pack/skills/only/SKILL.md': skillMarkdown({ name: 'only', description: 'Only' }),
    'both-pack/skills/other/SKILL.md': skillMarkdown({ name: 'other', description: 'Other' }),

    'broken-pack/.claude-plugin/plugin.json': JSON.stringify({ name: 'broken-pack' }),
    'broken-pack/skills/good/SKILL.md': skillMarkdown({ name: 'good', description: 'Good' }),
    'broken-pack/skills/bad/SKILL.md': '# no frontmatter at all\n',

    'off-pack/deep/SKILL.md': skillMarkdown({ name: 'off', description: 'Disabled' }),
  })
  return root
}

async function scan(root: string, table?: Map<string, boolean>) {
  const effective = table ?? (await readEnableTable(join(root, 'settings.json'))).table
  return await scanPacks({ packRoot: root, table: effective })
}

describe('pack scanning', () => {
  it('exposes exactly the eligible skills across all three modes', async () => {
    const root = await makeFixture()
    const { skills } = await scan(root)
    expect(new Set(skills.map((skill) => skill.name))).toEqual(
      new Set([
        'compat-pack-alpha',
        'compat-pack-beta',
        'compat-pack-loose',
        'my-team-release',
        'discovery-pack-deep-skill',
        'both-wins-only',
        'broken-pack-good',
      ]),
    )
  })

  it('lists compat skills[] entries and the one-level skills/*/SKILL.md scan', async () => {
    const root = await makeFixture()
    const { skills } = await scan(root)
    const byName = new Map(skills.map((skill) => [skill.name, skill]))
    expect(byName.get('compat-pack-alpha')?.description).toBe('Alpha skill')
    expect(byName.get('compat-pack-loose')).toBeDefined()
    // Nested category layout is only reachable through skills[], never the default scan.
    expect(byName.has('compat-pack-nested')).toBe(false)
  })

  it('carries disable-model-invocation through to the invocation policy', async () => {
    const root = await makeFixture()
    const { skills } = await scan(root)
    const beta = skills.find((skill) => skill.name === 'compat-pack-beta')
    expect(beta?.invocation).toEqual({ modelInvocable: false, userInvocable: true })
  })

  it('treats the manifest whitelist as exhaustive', async () => {
    const root = await makeFixture()
    const { skills } = await scan(root)
    expect(skills.some((skill) => skill.name === 'my-team-extra')).toBe(false)
  })

  it('ignores node_modules, dist and hidden directories in discovery mode', async () => {
    const root = await makeFixture()
    const { skills } = await scan(root)
    const discovery = skills.filter((skill) => skill.name.startsWith('discovery-pack-'))
    expect(discovery.map((skill) => skill.name)).toEqual(['discovery-pack-deep-skill'])
  })

  it('diagnoses a marketplace-only pack without expanding it', async () => {
    const root = await makeFixture()
    const { skills, problems } = await scan(root)
    expect(skills.some((skill) => skill.name.startsWith('marketplace-pack'))).toBe(false)
    expect(problems.some((problem) => problem.includes('marketplace-only'))).toBe(true)
  })

  it('lets the manifest win when both markers exist', async () => {
    const root = await makeFixture()
    const { skills, problems } = await scan(root)
    expect(skills.some((skill) => skill.name === 'both-wins-only')).toBe(true)
    expect(skills.some((skill) => skill.name === 'both-pack-other')).toBe(false)
    expect(problems.some((problem) => problem.includes('manifest wins'))).toBe(true)
  })

  it('drops one bad skill without losing the rest of its pack', async () => {
    const root = await makeFixture()
    const { skills, problems } = await scan(root)
    expect(skills.some((skill) => skill.name === 'broken-pack-good')).toBe(true)
    expect(problems.some((problem) => problem.includes('missing YAML frontmatter'))).toBe(true)
  })

  it('never scans a pack without an enabled entry', async () => {
    const root = await makeFixture()
    const { skills } = await scan(root)
    expect(skills.some((skill) => skill.name.startsWith('off-pack'))).toBe(false)
  })

  it('warns when the enable table names a directory that does not exist', async () => {
    const root = await makeFixture()
    const { problems } = await scan(root, new Map([['ghost-pack', true]]))
    expect(problems.some((problem) => problem.includes('ghost-pack'))).toBe(true)
  })

  it('keeps the first pack when two packs collide on a canonical name', async () => {
    const root = await makeTempRoot()
    await writeTree(root, {
      'a/.claude-plugin/plugin.json': JSON.stringify({ name: 'a' }),
      'a/skills/x/SKILL.md': skillMarkdown({ name: 'b-c', description: 'From a' }),
      'a-b/.claude-plugin/plugin.json': JSON.stringify({ name: 'a-b' }),
      'a-b/skills/x/SKILL.md': skillMarkdown({ name: 'c', description: 'From a-b' }),
    })
    const { skills, problems } = await scan(
      root,
      new Map([
        ['a', true],
        ['a-b', true],
      ]),
    )
    expect(skills.map((skill) => skill.name)).toEqual(['a-b-c'])
    expect(skills[0]?.description).toBe('From a')
    expect(problems.some((problem) => problem.includes('already exposed it'))).toBe(true)
  })

  it('rejects manifest paths that escape the pack root', async () => {
    const root = await makeTempRoot()
    await writeTree(root, {
      'escape-pack/.skill-pack/skills.json': JSON.stringify({
        name: 'escape-pack',
        skills: ['../outside'],
      }),
      'outside/SKILL.md': skillMarkdown({ name: 'outside', description: 'Outside' }),
    })
    const { skills, problems } = await scan(root, new Map([['escape-pack', true]]))
    expect(skills).toEqual([])
    expect(problems.some((problem) => problem.includes('escapes the pack root'))).toBe(true)
  })

  it('rejects a namespace that normalizes to something invalid', async () => {
    const root = await makeTempRoot()
    await writeTree(root, {
      'weird/.claude-plugin/plugin.json': JSON.stringify({ name: '***' }),
      'weird/skills/x/SKILL.md': skillMarkdown({ name: 'x', description: 'X' }),
    })
    const { skills, problems } = await scan(root, new Map([['weird', true]]))
    expect(skills).toEqual([])
    expect(problems.some((problem) => problem.includes('invalid'))).toBe(true)
  })
})
