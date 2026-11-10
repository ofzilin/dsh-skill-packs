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
import type { SkillInvocationPolicy } from '@deepseek-ai/dsh-skill';
/** Parsed skill metadata plus the body that follows the frontmatter. */
export interface ParsedSkill {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly invocation: SkillInvocationPolicy;
    readonly metadata?: Record<string, unknown>;
}
/** Result of parsing one SKILL.md: either the skill and its body, or a reason. */
export type SkillFileResult = {
    readonly ok: true;
    readonly skill: ParsedSkill;
    readonly body: string;
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * Parse one SKILL.md source.
 * @param raw - complete file contents.
 * @returns the parsed skill with its body, or a human-readable reason.
 */
export declare function parseSkillFile(raw: string): SkillFileResult;
