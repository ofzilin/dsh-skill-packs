/**
 * Plugin options: `<pack root>/config.json`.
 *
 * The enable table (`settings.json`) stays hand-editable and boolean-only, so
 * options live beside it in their own file. The configuration page reads and
 * writes this file through the plugin's own HTTP routes; the harness config
 * editor cannot see either file because it owns the profile patch.
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** File name of the plugin options document in the pack root. */
export const OPTIONS_FILE = 'config.json'

/** How references to same-pack skills are treated inside a loaded body. */
export type ReferenceMode = 'both' | 'note' | 'rewrite' | 'off'

/** Every accepted reference mode, in UI order. */
export const REFERENCE_MODES: readonly ReferenceMode[] = ['both', 'note', 'rewrite', 'off']

/** Default reference handling for every pack. */
export interface ReferenceConfig {
  readonly mode: ReferenceMode
}

/** Per-pack override; an omitted mode inherits the global one. */
export interface PackConfig {
  readonly mode?: ReferenceMode
}

/** The complete options document. */
export interface PluginConfig {
  readonly references: ReferenceConfig
  readonly packs: Readonly<Record<string, PackConfig>>
}

/** Configuration used when the options file is missing or unreadable. */
export const DEFAULT_PLUGIN_CONFIG: PluginConfig = { references: { mode: 'both' }, packs: {} }

/** One options read: the config plus anything worth reporting. */
export interface OptionsRead {
  readonly config: PluginConfig
  readonly problems: readonly string[]
}

/**
 * Read the options file. A missing file is the normal default state.
 * @param path - absolute options file path.
 * @returns the parsed config and diagnostics.
 */
export async function readOptions(path: string): Promise<OptionsRead> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return { config: DEFAULT_PLUGIN_CONFIG, problems: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      config: DEFAULT_PLUGIN_CONFIG,
      problems: [`${path}: invalid JSON: ${messageOf(error)}`],
    }
  }
  const result = parsePluginConfig(parsed, path)
  return { config: result.config, problems: result.problems }
}

/**
 * Validate a raw options document.
 * @param value - parsed JSON value.
 * @param label - path prefix used in diagnostics.
 * @returns the accepted config and any diagnostics.
 */
export function parsePluginConfig(value: unknown, label: string): { config: PluginConfig; problems: string[] } {
  const problems: string[] = []
  if (value === undefined) return { config: DEFAULT_PLUGIN_CONFIG, problems }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${label}: expected an object`)
    return { config: DEFAULT_PLUGIN_CONFIG, problems }
  }
  const fields = value as Record<string, unknown>
  const references = parseReferenceConfig(fields.references, `${label}.references`, problems)
    ?? DEFAULT_PLUGIN_CONFIG.references

  const packs: Record<string, PackConfig> = {}
  if (fields.packs !== undefined) {
    if (typeof fields.packs !== 'object' || fields.packs === null || Array.isArray(fields.packs)) {
      problems.push(`${label}.packs: expected an object keyed by pack directory`)
    } else {
      for (const [pack, raw] of Object.entries(fields.packs)) {
        const override = parsePackConfig(raw, `${label}.packs.${pack}`, problems)
        if (override !== undefined) packs[pack] = override
      }
    }
  }
  return { config: { references, packs }, problems }
}

/** Resolve the effective reference mode for one pack directory. */
export function resolveReferenceMode(config: PluginConfig, pack: string): ReferenceMode {
  return config.packs[pack]?.mode ?? config.references.mode
}

/**
 * Persist the options document through a temporary sibling, so a crash never
 * truncates it.
 * @param path - absolute options file path.
 * @param config - config to write.
 */
export async function writeOptions(path: string, config: PluginConfig): Promise<void> {
  const document = {
    references: config.references,
    ...(Object.keys(config.packs).length === 0 ? {} : { packs: config.packs }),
  }
  const temporary = join(dirname(path), `.config.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

function parseReferenceConfig(
  value: unknown,
  label: string,
  problems: string[],
): ReferenceConfig | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${label}: expected an object`)
    return undefined
  }
  const mode = (value as Record<string, unknown>).mode
  if (mode === undefined) return { mode: DEFAULT_PLUGIN_CONFIG.references.mode }
  if (!isReferenceMode(mode)) {
    problems.push(`${label}.mode: expected one of ${REFERENCE_MODES.join(', ')}`)
    return undefined
  }
  return { mode }
}

function parsePackConfig(value: unknown, label: string, problems: string[]): PackConfig | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${label}: expected an object`)
    return undefined
  }
  const mode = (value as Record<string, unknown>).mode
  if (mode === undefined) return {}
  if (!isReferenceMode(mode)) {
    problems.push(`${label}.mode: expected one of ${REFERENCE_MODES.join(', ')}`)
    return {}
  }
  return { mode }
}

function isReferenceMode(value: unknown): value is ReferenceMode {
  return typeof value === 'string' && (REFERENCE_MODES as readonly string[]).includes(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
