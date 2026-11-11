/**
 * Pack discovery: turn the pack root plus the enable table into skill records.
 *
 * Three pack modes are selected by marker files, in this order (ADR 0004):
 * manifest (`.skill-pack/skills.json`), compat (`.claude-plugin/plugin.json`),
 * discovery (bare `SKILL.md`, recursive). Everything this module returns is
 * already validated against the registry grammar — the registry throws on an
 * invalid candidate, so a bad pack must be dropped here, with a diagnostic.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { SkillInvocationPolicy } from '@deepseek-ai/dsh-skill'

import { parseSkillFile } from './frontmatter'
import { canonicalName, isSkillName, normalizeNamePart } from './names'
import type { SiblingSkill } from './references'
import type { EnableTable } from './settings'

/** Which marker decided how a pack is interpreted. */
export type PackMode = 'manifest' | 'compat' | 'discovery'

/** One skill resolved from a pack, addressed by its canonical registry name. */
export interface PackSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: SkillInvocationPolicy
  readonly skillFile: string
  readonly directory: string
  readonly metadata?: Record<string, unknown>
}

/** Outcome of scanning one pack directory. */
export interface PackScan {
  readonly pack: string
  readonly mode: PackMode
  readonly namespace: string
  readonly skills: readonly PackSkill[]
  readonly problems: readonly string[]
}

/** A pack skill plus the context `get()` needs to resolve in-body references. */
export interface ResolvedSkill extends PackSkill {
  readonly pack: string
  readonly namespace: string
  readonly siblings: readonly SiblingSkill[]
}

/** Aggregate outcome of scanning the whole pack root. */
export interface PackScanBatch {
  readonly skills: readonly ResolvedSkill[]
  readonly problems: readonly string[]
}

const SKILL_FILE = 'SKILL.md'
const MANIFEST_FILE = join('.skill-pack', 'skills.json')
const PLUGIN_FILE = join('.claude-plugin', 'plugin.json')
const MARKETPLACE_FILE = join('.claude-plugin', 'marketplace.json')

/** Directories never descended into by discovery mode or watched for changes. */
export const IGNORED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
])

type JsonRead =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string }

/**
 * Scan the pack root: apply the enable table, classify each enabled directory,
 * collect its skills, and drop duplicate canonical names.
 * @param options - pack root, enable table, abort signal, and sink for diagnostics.
 * @returns every skill this provider should expose, plus diagnostics.
 */
export async function scanPacks(options: {
  readonly packRoot: string
  readonly table: EnableTable
  readonly signal?: AbortSignal | undefined
}): Promise<PackScanBatch> {
  const problems: string[] = []
  const directoryNames = await listPackDirectories(options.packRoot)

  for (const [key, enabled] of options.table) {
    if (enabled && !directoryNames.includes(key)) {
      problems.push(`pack root: enabled pack "${key}" has no directory`)
    }
  }

  const skills: ResolvedSkill[] = []
  const seen = new Map<string, string>()

  for (const directoryName of directoryNames) {
    options.signal?.throwIfAborted()
    // No entry means "not enabled"; disabled packs are never scanned.
    if (options.table.get(directoryName) !== true) continue
    const pack: PackScan | undefined = await scanPack(
      join(options.packRoot, directoryName),
      directoryName,
      options.signal,
    )
    if (pack === undefined) {
      if (options.table.get(directoryName) === true) {
        problems.push(`pack "${directoryName}": enabled but holds no skill pack marker and no SKILL.md`)
      }
      continue
    }
    problems.push(...pack.problems)
    const siblings: SiblingSkill[] = pack.skills.map((skill) => ({
      name: bareName(skill.name, pack.namespace),
      canonical: skill.name,
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
    }))
    for (const skill of pack.skills) {
      const owner = seen.get(skill.name)
      if (owner !== undefined) {
        problems.push(
          `pack "${pack.pack}": skill "${skill.name}" ignored because pack "${owner}" already exposed it`,
        )
        continue
      }
      seen.set(skill.name, pack.pack)
      skills.push({ ...skill, pack: pack.pack, namespace: pack.namespace, siblings })
    }
  }

  return { skills, problems }
}

/** List pack directory names, sorted, following symlinked pack directories. */
export async function listPackDirectories(packRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(packRoot, { withFileTypes: true })
  } catch {
    // A missing pack root is the normal fresh-install state.
    return []
  }
  const names: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      names.push(entry.name)
      continue
    }
    if (entry.isSymbolicLink() && (await kindOf(join(packRoot, entry.name))) === 'dir') {
      names.push(entry.name)
    }
  }
  return names.sort((left, right) => left.localeCompare(right))
}

/**
 * Classify and scan one pack directory.
 * @returns the scan, or `undefined` when the directory is not a pack at all.
 */
export async function scanPack(
  packDirectory: string,
  directoryName: string,
  signal?: AbortSignal | undefined,
): Promise<PackScan | undefined> {
  const hasManifest = (await kindOf(join(packDirectory, MANIFEST_FILE))) === 'file'
  const hasPlugin = (await kindOf(join(packDirectory, PLUGIN_FILE))) === 'file'
  const hasMarketplace = (await kindOf(join(packDirectory, MARKETPLACE_FILE))) === 'file'

  if (hasManifest) {
    const scan = await scanManifestPack(packDirectory, directoryName)
    if (!hasPlugin) return scan
    return {
      ...scan,
      problems: [
        ...scan.problems,
        `pack "${directoryName}": has both .skill-pack/skills.json and .claude-plugin/plugin.json; manifest wins`,
      ],
    }
  }

  if (hasPlugin) return scanCompatPack(packDirectory, directoryName)

  if (hasMarketplace) {
    return {
      pack: directoryName,
      mode: 'compat',
      namespace: normalizeNamePart(directoryName),
      skills: [],
      problems: [
        `pack "${directoryName}": marketplace-only repository (no plugin.json) is not expanded in v1`,
      ],
    }
  }

  const scanned = await scanDiscoveryPack(packDirectory, directoryName, signal)
  if (scanned.skills.length === 0 && scanned.problems.length === 0) return undefined
  return scanned
}

async function scanManifestPack(packDirectory: string, directoryName: string): Promise<PackScan> {
  const manifestPath = join(packDirectory, MANIFEST_FILE)
  const problems: string[] = []
  const read = await readJson(manifestPath)
  if (read === undefined) {
    return failed(directoryName, 'manifest', [`${manifestPath}: unreadable`])
  }
  if (!read.ok) return failed(directoryName, 'manifest', [`${manifestPath}: ${read.reason}`])
  if (typeof read.value !== 'object' || read.value === null || Array.isArray(read.value)) {
    return failed(directoryName, 'manifest', [`${manifestPath}: expected an object`])
  }

  const fields = read.value as Record<string, unknown>
  const declaredName = stringOr(fields.name, directoryName)
  const namespace = normalizeNamePart(declaredName)
  if (!isSkillName(namespace)) {
    return failed(directoryName, 'manifest', [
      `pack "${directoryName}": namespace "${declaredName}" normalizes to invalid "${namespace}"`,
    ])
  }

  const entries = fields.skills
  if (entries === undefined) return { pack: directoryName, mode: 'manifest', namespace, skills: [], problems }
  if (!Array.isArray(entries)) {
    return failed(directoryName, 'manifest', [`${manifestPath}: "skills" must be an array`])
  }

  const skills = await collectListedSkills(entries, packDirectory, namespace, problems)
  return { pack: directoryName, mode: 'manifest', namespace, skills, problems }
}

async function scanCompatPack(packDirectory: string, directoryName: string): Promise<PackScan | undefined> {
  const pluginPath = join(packDirectory, PLUGIN_FILE)
  const read = await readJson(pluginPath)
  if (read === undefined) return undefined
  if (!read.ok) return failed(directoryName, 'compat', [`${pluginPath}: ${read.reason}`])
  if (typeof read.value !== 'object' || read.value === null || Array.isArray(read.value)) {
    return failed(directoryName, 'compat', [`${pluginPath}: expected an object`])
  }

  const fields = read.value as Record<string, unknown>
  const declaredName = stringOr(fields.name, directoryName)
  const namespace = normalizeNamePart(declaredName)
  if (!isSkillName(namespace)) {
    return failed(directoryName, 'compat', [
      `pack "${directoryName}": namespace "${declaredName}" normalizes to invalid "${namespace}"`,
    ])
  }

  const problems: string[] = []
  const skillsRoot = join(packDirectory, 'skills')
  const hasSkillsDirectory = (await kindOf(skillsRoot)) === 'dir'
  const hasSkillsKey = Object.hasOwn(fields, 'skills')
  const rootSkillFile = join(packDirectory, SKILL_FILE)

  // Claude's single-skill pack: the plugin itself is the skill.
  if (!hasSkillsDirectory && !hasSkillsKey && (await kindOf(rootSkillFile)) === 'file') {
    const single = await readSkillAt(packDirectory, namespace)
    if ('problem' in single) return failed(directoryName, 'compat', [single.problem])
    return {
      pack: directoryName,
      mode: 'compat',
      namespace,
      skills: [{ ...single.skill, name: namespace }],
      problems,
    }
  }

  const skills: PackSkill[] = []
  if (hasSkillsKey) {
    if (!Array.isArray(fields.skills)) {
      problems.push(`${pluginPath}: "skills" must be an array`)
    } else {
      skills.push(...(await collectListedSkills(fields.skills, packDirectory, namespace, problems)))
    }
  }

  if (hasSkillsDirectory) {
    for (const entry of await sortedEntries(skillsRoot)) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const skillDirectory = join(skillsRoot, entry.name)
      if ((await kindOf(join(skillDirectory, SKILL_FILE))) !== 'file') continue
      const read = await readSkillAt(skillDirectory, namespace)
      if ('problem' in read) problems.push(read.problem)
      else skills.push(read.skill)
    }
  }

  return { pack: directoryName, mode: 'compat', namespace, skills: dedupe(skills, problems), problems }
}

async function scanDiscoveryPack(
  packDirectory: string,
  directoryName: string,
  signal?: AbortSignal | undefined,
): Promise<PackScan> {
  const problems: string[] = []
  const namespace = normalizeNamePart(directoryName)
  if (!isSkillName(namespace)) {
    return failed(directoryName, 'discovery', [
      `pack "${directoryName}": directory name normalizes to invalid namespace "${namespace}"`,
    ])
  }

  const skills: PackSkill[] = []
  await walk(packDirectory)

  return { pack: directoryName, mode: 'discovery', namespace, skills: dedupe(skills, problems), problems }

  async function walk(directory: string): Promise<void> {
    signal?.throwIfAborted()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      problems.push(`${directory}: unreadable (${messageOf(error)})`)
      return
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || IGNORED_DIRECTORY_NAMES.has(entry.name)) continue
        await walk(path)
        continue
      }
      if (!entry.isFile() || entry.name !== SKILL_FILE) continue
      const read = await readSkillAt(directory, namespace)
      if ('problem' in read) problems.push(read.problem)
      else skills.push(read.skill)
    }
  }
}

/** Read `skills[]` style path entries shared by manifest and compat modes. */
async function collectListedSkills(
  entries: readonly unknown[],
  packDirectory: string,
  namespace: string,
  problems: string[],
): Promise<PackSkill[]> {
  const skills: PackSkill[] = []
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.length === 0) {
      problems.push(`skills[] entries must be non-empty strings`)
      continue
    }
    if (entry.includes('*')) {
      problems.push(`${entry}: globs are not supported`)
      continue
    }
    const target = resolve(packDirectory, entry)
    if (!isStrictlyInside(packDirectory, target)) {
      problems.push(`${entry}: escapes the pack root`)
      continue
    }
    if ((await kindOf(target)) !== 'dir') {
      problems.push(`${entry}: not a directory`)
      continue
    }
    const read = await readSkillAt(target, namespace)
    if ('problem' in read) problems.push(read.problem)
    else skills.push(read.skill)
  }
  return dedupe(skills, problems)
}

/** Parse one skill directory into a validated record. */
async function readSkillAt(
  directory: string,
  namespace: string,
): Promise<{ readonly skill: PackSkill } | { readonly problem: string }> {
  const skillFile = join(directory, SKILL_FILE)
  let raw: string
  try {
    raw = await readFile(skillFile, 'utf8')
  } catch (error) {
    return { problem: `${skillFile}: unreadable (${messageOf(error)})` }
  }

  const parsed = parseSkillFile(raw)
  if (!parsed.ok) return { problem: `${skillFile}: ${parsed.reason}` }
  if (!isSkillName(parsed.skill.name)) {
    return { problem: `${skillFile}: invalid skill name "${parsed.skill.name}"` }
  }

  const name = canonicalName(namespace, parsed.skill.name)
  if (!isSkillName(name)) return { problem: `${skillFile}: canonical name "${name}" is invalid` }

  return {
    skill: {
      name,
      description: parsed.skill.description,
      invocation: parsed.skill.invocation,
      skillFile,
      directory,
      ...(parsed.skill.whenToUse === undefined ? {} : { whenToUse: parsed.skill.whenToUse }),
      ...(parsed.skill.metadata === undefined ? {} : { metadata: parsed.skill.metadata }),
    },
  }
}

function dedupe(skills: readonly PackSkill[], problems: string[]): PackSkill[] {
  const seen = new Set<string>()
  const kept: PackSkill[] = []
  for (const skill of skills) {
    if (seen.has(skill.name)) {
      problems.push(`skill "${skill.name}" ignored because an earlier skill in the same pack already used that name`)
      continue
    }
    seen.add(skill.name)
    kept.push(skill)
  }
  return kept
}

function failed(directoryName: string, mode: PackMode, problems: readonly string[]): PackScan {
  return { pack: directoryName, mode, namespace: normalizeNamePart(directoryName), skills: [], problems }
}

async function sortedEntries(directory: string) {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.sort((left, right) => left.name.localeCompare(right.name))
  } catch {
    return []
  }
}

async function kindOf(path: string): Promise<'file' | 'dir' | undefined> {
  try {
    const stats = await stat(path)
    if (stats.isDirectory()) return 'dir'
    if (stats.isFile()) return 'file'
    return undefined
  } catch {
    return undefined
  }
}

async function readJson(path: string): Promise<JsonRead | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${messageOf(error)}` }
  }
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** Strip the namespace prefix from a canonical name. */
function bareName(canonical: string, namespace: string): string {
  const prefix = `${namespace}-`
  return canonical.startsWith(prefix) ? canonical.slice(prefix.length) : canonical
}

/** Whether `candidate` is inside `root` (and not the root itself). */
function isStrictlyInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
