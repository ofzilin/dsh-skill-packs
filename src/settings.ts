/**
 * The enable table: `<pack root>/settings.json` maps pack directory names to
 * booleans. Names are directory names, never namespaces, so renaming a
 * namespace inside a manifest does not orphan the entry.
 */

import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** File name of the enable table in both user-level and project-level roots. */
export const SETTINGS_FILE = 'settings.json'

/** Directory-name to enabled flag. A missing entry means "not enabled". */
export type EnableTable = ReadonlyMap<string, boolean>

/** One settings file read: the parsed table plus anything worth reporting. */
export interface SettingsRead {
  readonly table: EnableTable
  readonly problems: readonly string[]
}

const EMPTY_TABLE: EnableTable = new Map()

/**
 * Read one settings file. A missing file is a normal empty table; malformed
 * content is reported without blocking startup.
 * @param path - absolute settings file path.
 * @returns the parsed table and any diagnostics.
 */
export async function readEnableTable(path: string): Promise<SettingsRead> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return { table: EMPTY_TABLE, problems: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { table: EMPTY_TABLE, problems: [`${path}: invalid JSON: ${messageOf(error)}`] }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { table: EMPTY_TABLE, problems: [`${path}: expected an object of directory names`] }
  }

  const table = new Map<string, boolean>()
  const problems: string[] = []
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'boolean') {
      problems.push(`${path}: "${key}" must be true or false`)
      continue
    }
    table.set(key, value)
  }
  return { table, problems }
}

/** Merge tables with project-level entries overriding user-level ones. */
export function mergeTables(user: EnableTable, project: EnableTable): EnableTable {
  if (project.size === 0) return user
  const merged = new Map(user)
  for (const [key, value] of project) merged.set(key, value)
  return merged
}

/** Return whether a pack directory is switched on. */
export function isPackEnabled(table: EnableTable, directoryName: string): boolean {
  return table.get(directoryName) === true
}

/**
 * Walk up from `cwd` to the nearest ancestor containing `.git`, mirroring the
 * harness project-root rule. Falls back to `undefined` outside any repository.
 */
export async function findProjectRoot(cwd: string): Promise<string | undefined> {
  let current = cwd
  for (;;) {
    if (await pathExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** Absolute path of the project-level enable table for `cwd`, when there is one. */
export async function projectSettingsPath(cwd: string | undefined): Promise<string | undefined> {
  if (cwd === undefined) return undefined
  const root = await findProjectRoot(cwd)
  return root === undefined ? undefined : join(root, '.dsh', 'skill-packs', SETTINGS_FILE)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
