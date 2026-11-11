/**
 * The `skill-packs` provider: scan enabled packs, hand validated candidates to
 * the registry, and load bodies lazily.
 *
 * Candidates are summaries; the registry calls `get()` only when a skill is
 * actually used, so listing a large pack stays cheap. `get()` also applies the
 * reference policy: same-pack references are rewritten to canonical names, and
 * a namespace rule is prepended when a bare name survives.
 */
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import type { ResolvedConfig } from './config';
/** Registry-unique provider name; `filesystem` and `runtime` are taken by core. */
export declare const PROVIDER_NAME = "skill-packs";
/** Rank for user-level packs, between `user-dsh` (400) and `user-agents` (500). */
export declare const PACK_RANK = 450;
/** Source label carried by every candidate this provider contributes. */
export declare const PACK_SOURCE = "skill-packs";
/** Dependencies the provider needs from its plugin. */
export interface ProviderOptions {
    readonly config: ResolvedConfig;
    /** Diagnostics sink; the plugin prefixes it with the provider name. */
    readonly warn: (message: string) => void;
}
/**
 * Build the provider this plugin registers.
 *
 * The registry does not validate candidates for us: a malformed one throws out
 * of the whole catalog read, so everything returned here must already be valid.
 * @param options - resolved config and diagnostics sink.
 * @returns a provider over the configured pack root.
 */
export declare function createProvider(options: ProviderOptions): SkillProvider;
