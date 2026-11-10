/**
 * SKILL.md frontmatter parsing, aligned with the filesystem provider in core.
 *
 * Alignment matters: the same file must produce the same name, description and
 * invocation policy whether it is read from a flat skill root or from a pack.
 * The rules mirrored from core are: frontmatter opens on line 1 with `---`,
 * must parse as a YAML mapping, requires non-empty `name` and `description`,
 * uses the kebab-case `disable-model-invocation` / `user-invocable` keys, and
 * rejects the legacy camelCase spellings.
 */

import type { SkillInvocationPolicy } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** Parsed skill metadata plus the body that follows the frontmatter. */
export interface ParsedSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: SkillInvocationPolicy
  readonly metadata?: Record<string, unknown>
}

/** Result of parsing one SKILL.md: either the skill and its body, or a reason. */
export type SkillFileResult =
  | { readonly ok: true; readonly skill: ParsedSkill; readonly body: string }
  | { readonly ok: false; readonly reason: string }

const FRONTMATTER_DELIMITER = '---'

/**
 * Parse one SKILL.md source.
 * @param raw - complete file contents.
 * @returns the parsed skill with its body, or a human-readable reason.
 */
export function parseSkillFile(raw: string): SkillFileResult {
  const split = splitFrontmatter(raw)
  if (split === undefined) return { ok: false, reason: 'missing YAML frontmatter' }

  let data: unknown
  try {
    data = parseYaml(split.yaml)
  } catch (error) {
    return { ok: false, reason: `invalid YAML frontmatter: ${messageOf(error)}` }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'invalid YAML frontmatter: expected a mapping' }
  }
  const fields = data as Record<string, unknown>

  const name = stringField(fields, 'name')
  const description = stringField(fields, 'description')
  if (name === undefined || description === undefined) {
    return { ok: false, reason: 'frontmatter requires name and description' }
  }

  let invocation: SkillInvocationPolicy
  try {
    invocation = parseInvocationPolicy(fields)
  } catch (error) {
    return { ok: false, reason: `invalid invocation frontmatter: ${messageOf(error)}` }
  }

  const whenToUse = optionalString(fields, 'whenToUse')
  const metadata = optionalMetadata(fields)
  return {
    ok: true,
    skill: {
      name,
      description,
      invocation,
      ...(whenToUse === undefined ? {} : { whenToUse }),
      ...(metadata === undefined ? {} : { metadata }),
    },
    body: split.body,
  }
}

interface FrontmatterSplit {
  readonly yaml: string
  readonly body: string
}

function splitFrontmatter(raw: string): FrontmatterSplit | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== FRONTMATTER_DELIMITER) return undefined

  let lineStart = firstLineEnd + 1
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === FRONTMATTER_DELIMITER) {
      const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1
      return { yaml: raw.slice(firstLineEnd + 1, lineStart), body: raw.slice(bodyStart) }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

function parseInvocationPolicy(fields: Record<string, unknown>): SkillInvocationPolicy {
  rejectLegacyKey(fields, 'disableModelInvocation', 'disable-model-invocation')
  rejectLegacyKey(fields, 'modelInvocable', 'disable-model-invocation')
  rejectLegacyKey(fields, 'userInvocable', 'user-invocable')
  const disableModelInvocation = booleanField(fields, 'disable-model-invocation')
  const userInvocable = booleanField(fields, 'user-invocable')
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  }
}

function rejectLegacyKey(fields: Record<string, unknown>, legacy: string, canonical: string): void {
  if (Object.hasOwn(fields, legacy)) {
    throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`)
  }
}

function booleanField(fields: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(fields, key)) return undefined
  const value = fields[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
      default:
        break
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`)
}

function stringField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalString(fields: Record<string, unknown>, key: string): string | undefined {
  return stringField(fields, key)
}

function optionalMetadata(fields: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = fields.metadata
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
