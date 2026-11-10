/**
 * `dsh-skill-packs` — mount whole skill repositories into the harness.
 *
 * This plugin owns a sibling provider in `ctx.skills`; it never replaces or
 * reconfigures `skill-filesystem`, and it never injects skill bodies itself.
 * Core's `/name` gesture, the `skill` tool and the client menu all read the
 * registry, so putting names there is the whole job (ADR 0005).
 * @module dsh-skill-packs
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config';
/** Cordis plugin name. */
export declare const name = "skill-packs";
/** Service this plugin needs before it can register anything. */
export declare const inject: string[];
/**
 * Register the pack provider and watch the pack root for changes.
 *
 * The watcher calls `control.invalidate()` so a freshly cloned pack shows up in
 * the current session instead of the next one. Disposing the plugin unregisters
 * the provider (its names disappear) and closes the watcher.
 * @param ctx - host context carrying the skill registry.
 * @param config - optional pack root override.
 */
export declare function apply(ctx: Context, config?: Config): void;
export type { Config } from './config';
