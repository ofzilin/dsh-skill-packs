/**
 * The `skill-packs` provider: scan enabled packs, hand validated candidates to
 * the registry, and load bodies lazily.
 *
 * Candidates are summaries; the registry calls `get()` only when a skill is
 * actually used, so listing a large pack stays cheap. `get()` also applies the
 * reference policy: same-pack references are rewritten to canonical names, and
 * a namespace rule is prepended when a bare name survives.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill'

import type { ResolvedConfig } from './config'
import { parseSkillFile } from './frontmatter'
import {
  DEFAULT_PLUGIN_CONFIG,
  OPTIONS_FILE,
  type PluginConfig,
  readOptions,
  resolveReferenceMode,
} from './options'
import { type ResolvedSkill, scanPacks } from './packs'
import { applyReferencePolicy, type SiblingSkill } from './references'
import { mergeTables, projectSettingsPath, readEnableTable, SETTINGS_FILE } from './settings'

/** Registry-unique provider name; `filesystem` and `runtime` are taken by core. */
export const PROVIDER_NAME = 'skill-packs'

/** Rank for user-level packs, between `user-dsh` (400) and `user-agents` (500). */
export const PACK_RANK = 450

/** Source label carried by every candidate this provider contributes. */
export const PACK_SOURCE = 'skill-packs'

interface PackLocator {
  readonly kind: 'pack-skill'
  readonly skillFile: string
  readonly directory: string
  readonly pack: string
  readonly namespace: string
  readonly siblings: readonly SiblingSkill[]
}

/** Dependencies the provider needs from its plugin. */
export interface ProviderOptions {
  readonly config: ResolvedConfig
  /** Diagnostics sink; the plugin prefixes it with the provider name. */
  readonly warn: (message: string) => void
}

/**
 * Build the provider this plugin registers.
 *
 * The registry does not validate candidates for us: a malformed one throws out
 * of the whole catalog read, so everything returned here must already be valid.
 * @param options - resolved config and diagnostics sink.
 * @returns a provider over the configured pack root.
 */
export function createProvider(options: ProviderOptions): SkillProvider {
  // Both files are watched, so a change invalidates the catalog and the next
  // `list()` refreshes this value before any body is loaded.
  let pluginConfig: PluginConfig = DEFAULT_PLUGIN_CONFIG

  return {
    name: PROVIDER_NAME,

    list: async (lookup) => {
      const table = await loadEnableTable(options.config.packRoot, lookup.cwd, options.warn)
      const read = await readOptions(join(options.config.packRoot, OPTIONS_FILE))
      for (const problem of read.problems) options.warn(problem)
      pluginConfig = read.config

      const batch = await scanPacks({
        packRoot: options.config.packRoot,
        table,
        signal: lookup.signal,
      })
      for (const problem of batch.problems) options.warn(problem)
      return batch.skills.map(toCandidate)
    },

    get: async (candidate: SkillCandidate): Promise<SkillDefinition | undefined> => {
      const locator = asLocator(candidate.locator)
      if (locator === undefined) return undefined

      let raw: string
      try {
        raw = await readFile(locator.skillFile, 'utf8')
      } catch {
        // A pack removed between listing and loading is not an error.
        return undefined
      }
      const parsed = parseSkillFile(raw)
      if (!parsed.ok) return undefined

      const applied = applyReferencePolicy({
        body: parsed.body,
        namespace: locator.namespace,
        self: candidate.name,
        siblings: locator.siblings,
        mode: resolveReferenceMode(pluginConfig, locator.pack),
      })

      return {
        name: candidate.name,
        description: parsed.skill.description,
        invocation: parsed.skill.invocation,
        provider: PROVIDER_NAME,
        source: PACK_SOURCE,
        path: locator.skillFile,
        resourceBase: { kind: 'directory', path: locator.directory },
        content: applied.content,
        ...(parsed.skill.whenToUse === undefined ? {} : { whenToUse: parsed.skill.whenToUse }),
        ...(parsed.skill.metadata === undefined ? {} : { metadata: parsed.skill.metadata }),
      }
    },
  }
}

async function loadEnableTable(
  packRoot: string,
  cwd: string | undefined,
  warn: (message: string) => void,
) {
  const userRead = await readEnableTable(join(packRoot, SETTINGS_FILE))
  for (const problem of userRead.problems) warn(problem)

  const projectPath = await projectSettingsPath(cwd)
  if (projectPath === undefined) return userRead.table

  const projectRead = await readEnableTable(projectPath)
  for (const problem of projectRead.problems) warn(problem)
  // The project file only declares intent (which packs).
  return mergeTables(userRead.table, projectRead.table)
}

function toCandidate(skill: ResolvedSkill): SkillCandidate {
  const locator: PackLocator = {
    kind: 'pack-skill',
    skillFile: skill.skillFile,
    directory: skill.directory,
    pack: skill.pack,
    namespace: skill.namespace,
    siblings: skill.siblings,
  }
  return {
    name: skill.name,
    description: skill.description,
    invocation: skill.invocation,
    provider: PROVIDER_NAME,
    source: PACK_SOURCE,
    path: skill.skillFile,
    resourceBase: { kind: 'directory', path: skill.directory },
    rank: PACK_RANK,
    locator,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    ...(skill.metadata === undefined ? {} : { metadata: skill.metadata }),
  }
}

function asLocator(value: unknown): PackLocator | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const locator = value as Partial<PackLocator>
  if (locator.kind !== 'pack-skill') return undefined
  if (typeof locator.skillFile !== 'string' || typeof locator.directory !== 'string') return undefined
  if (typeof locator.pack !== 'string' || typeof locator.namespace !== 'string') return undefined
  if (!Array.isArray(locator.siblings)) return undefined
  return {
    kind: 'pack-skill',
    skillFile: locator.skillFile,
    directory: locator.directory,
    pack: locator.pack,
    namespace: locator.namespace,
    siblings: locator.siblings as SiblingSkill[],
  }
}
