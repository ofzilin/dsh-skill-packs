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
import type { ReferenceMode } from './options';
/** One sibling skill that a body may refer to by its bare name. */
export interface SiblingSkill {
    /** Name as written in the pack's frontmatter, without the namespace prefix. */
    readonly name: string;
    /** Registry name (`<namespace>-<name>`). */
    readonly canonical: string;
    readonly modelInvocable: boolean;
    readonly userInvocable: boolean;
}
/** Result of applying the reference policy to one body. */
export interface ReferenceResult {
    readonly content: string;
    /** Number of references rewritten to canonical names. */
    readonly rewritten: number;
    /** Bare sibling names that remain in the text after rewriting. */
    readonly residual: readonly string[];
}
/**
 * Apply the reference policy to one skill body.
 * @param options - body text, owning pack, skill identity, siblings and mode.
 * @returns the (possibly prefixed and rewritten) body plus diagnostics counts.
 */
export declare function applyReferencePolicy(options: {
    readonly body: string;
    readonly namespace: string;
    readonly self: string;
    readonly siblings: readonly SiblingSkill[];
    readonly mode: ReferenceMode;
}): ReferenceResult;
