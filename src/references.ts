/**
 * Reference handling inside a loaded pack body.
 *
 * Pack bodies talk about sibling skills by their bare names. Once a pack is
 * namespaced, `grilling` is not a registry name; `mattpocock-skills-grilling`
 * is. The plugin cannot tell a skill reference from an ordinary word, so it
 * only rewrites two syntactic shapes that cannot be prose:
 *
 * - `` `/name` `` — the invocation gesture itself (core's own grammar);
 * - `"name"` on a line that also mentions `skill` — the tool-call shape.
 *
 * Everything else is left untouched; when a bare sibling name survives the
 * rewrite, a one-paragraph namespace rule is prepended so the model can still
 * resolve it semantically.
 */

import type { ReferenceMode } from './options'

/** One sibling skill that a body may refer to by its bare name. */
export interface SiblingSkill {
  /** Name as written in the pack's frontmatter, without the namespace prefix. */
  readonly name: string
  /** Registry name (`<namespace>-<name>`). */
  readonly canonical: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/** Result of applying the reference policy to one body. */
export interface ReferenceResult {
  readonly content: string
  /** Number of references rewritten to canonical names. */
  readonly rewritten: number
  /** Bare sibling names that remain in the text after rewriting. */
  readonly residual: readonly string[]
}

/**
 * Apply the reference policy to one skill body.
 * @param options - body text, owning pack, skill identity, siblings and mode.
 * @returns the (possibly prefixed and rewritten) body plus diagnostics counts.
 */
export function applyReferencePolicy(options: {
  readonly body: string
  readonly namespace: string
  readonly self: string
  readonly siblings: readonly SiblingSkill[]
  readonly mode: ReferenceMode
}): ReferenceResult {
  const siblings = options.siblings.filter((sibling) => sibling.canonical !== options.self)
  if (options.mode === 'off' || siblings.length === 0) {
    return { content: options.body, rewritten: 0, residual: [] }
  }

  const byName = new Map(siblings.map((sibling) => [sibling.name, sibling]))
  let rewritten = 0

  const rewriteSlash = options.mode === 'both' || options.mode === 'rewrite'
  const rewriteQuotes = rewriteSlash

  const lines = options.body.split('\n').map((line) => {
    let next = line
    if (rewriteSlash) {
      next = next.replace(/(?<![:/])\/([a-z0-9][a-z0-9-]*)/g, (match, bare: string) => {
        const sibling = byName.get(bare)
        if (sibling === undefined || !sibling.userInvocable) return match
        rewritten += 1
        return `/${sibling.canonical}`
      })
    }
    if (rewriteQuotes && /skill/i.test(next)) {
      next = next.replace(/(["'])([a-z0-9][a-z0-9-]*)\1/g, (match, quote: string, bare: string) => {
        const sibling = byName.get(bare)
        if (sibling === undefined || !sibling.modelInvocable) return match
        rewritten += 1
        return `${quote}${sibling.canonical}${quote}`
      })
    }
    return next
  })

  const rewrittenBody = lines.join('\n')
  const residual = siblings
    .map((sibling) => sibling.name)
    .filter((name) => appearsBare(rewrittenBody, name))

  if (options.mode === 'both' || options.mode === 'note') {
    if (residual.length > 0) {
      return {
        content: `${namespaceRule(options.namespace, residual[0] ?? '')}\n\n${rewrittenBody}`,
        rewritten,
        residual,
      }
    }
  }

  return { content: rewrittenBody, rewritten, residual }
}

/** Whether `name` appears in `text` outside a longer kebab token or a prefixed name. */
function appearsBare(text: string, name: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9-])${escapeRegExp(name)}(?![a-z0-9-])`)
  return pattern.test(text)
}

function namespaceRule(namespace: string, example: string): string {
  return [
    `> **Pack namespace.** This skill belongs to the pack \`${namespace}\`; same-pack skills`,
    `> referenced here are registered with a \`${namespace}-\` prefix (for example \`${example}\` →`,
    `> \`${namespace}-${example}\`). When a bare name in this text refers to a skill rather than an`,
    '> ordinary word, use the prefixed name.',
  ].join(' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
