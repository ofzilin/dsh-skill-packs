import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PLUGIN_CONFIG,
  OPTIONS_FILE,
  parsePluginConfig,
  readOptions,
  resolveReferenceMode,
  writeOptions,
} from '../src/options'
import { makeTempRoot, writeTree } from './helpers'

describe('plugin options', () => {
  it('defaults when the options file is missing', async () => {
    const root = await makeTempRoot()
    const read = await readOptions(join(root, OPTIONS_FILE))
    expect(read.config).toEqual(DEFAULT_PLUGIN_CONFIG)
    expect(read.problems).toEqual([])
  })

  it('parses a global mode and per-pack overrides', () => {
    const parsed = parsePluginConfig(
      { references: { mode: 'note' }, packs: { 'mattpocock-skills': { mode: 'off' } } },
      'config.json',
    )
    expect(parsed.problems).toEqual([])
    expect(resolveReferenceMode(parsed.config, 'mattpocock-skills')).toBe('off')
    expect(resolveReferenceMode(parsed.config, 'other-pack')).toBe('note')
  })

  it('reports an unknown mode and keeps the default', () => {
    const parsed = parsePluginConfig({ references: { mode: 'loud' } }, 'config.json')
    expect(parsed.problems[0]).toContain('expected one of')
    expect(parsed.config.references.mode).toBe('both')
  })

  it('round-trips through the options file', async () => {
    const root = await makeTempRoot()
    const path = join(root, OPTIONS_FILE)
    await writeOptions(path, {
      references: { mode: 'rewrite' },
      packs: { 'a-pack': { mode: 'off' } },
    })
    const read = await readOptions(path)
    expect(read.problems).toEqual([])
    expect(read.config).toEqual({ references: { mode: 'rewrite' }, packs: { 'a-pack': { mode: 'off' } } })
  })

  it('reports invalid JSON without throwing', async () => {
    const root = await makeTempRoot()
    await writeTree(root, { [OPTIONS_FILE]: '{ not json' })
    const read = await readOptions(join(root, OPTIONS_FILE))
    expect(read.problems[0]).toContain('invalid JSON')
    expect(read.config).toEqual(DEFAULT_PLUGIN_CONFIG)
  })
})
