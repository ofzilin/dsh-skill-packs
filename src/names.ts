/**
 * Skill-name grammar, shared with the registry.
 *
 * The registry validates every candidate with `^[a-z0-9]+(?:-[a-z0-9]+)*$` and
 * throws *outside* the guard around `provider.list()`, so one invalid name from
 * this provider would break every catalog read — not just this pack's skills.
 *
 * Installed plugins cannot resolve `@deepseek-ai/*` at runtime (the profile's
 * `node_modules` does not contain the harness packages), so the grammar is
 * copied rather than imported. `tests/names.spec.ts` pins this copy against the
 * real `isSkillName` so drift fails the suite instead of failing a session.
 */

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Return whether `value` is a name the skill registry will accept. */
export function isSkillName(value: string): boolean {
  return SKILL_NAME.test(value)
}

/**
 * Normalize a namespace candidate: lower-case, `_`/`.`/whitespace to `-`,
 * collapse runs, trim edges. Mirrors the published normalization rule.
 */
export function normalizeNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_.\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Compose the registry identity of a pack skill. */
export function canonicalName(namespace: string, skill: string): string {
  return `${namespace}-${skill}`
}
