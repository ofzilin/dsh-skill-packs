/**
 * `dsh-skill-packs` — mount whole skill repositories into the harness.
 *
 * This plugin owns a sibling provider in `ctx.skills`; it never replaces or
 * reconfigures `skill-filesystem`, and it never injects skill bodies itself.
 * Core's `/name` gesture, the `skill` tool and the client menu all read the
 * registry, so putting names there is the whole job (ADR 0005).
 *
 * It also serves its own configuration page: the pack-root settings are
 * invisible to the harness config editor (which owns the profile patch), so the
 * plugin exposes `GET /skill-packs/state` and `POST /skill-packs/save` for the
 * client half registered on the Plugins page. Options live in `config.json`
 * beside the enable table, which stays hand-editable and untouched by the UI.
 * @module dsh-skill-packs
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config';
/** Cordis plugin name. */
export declare const name = "skill-packs";
/** Service this plugin needs before it can register anything. */
export declare const inject: string[];
/**
 * Register the pack provider, watch the pack root, and serve the settings page.
 * @param ctx - host context carrying the skill registry.
 * @param config - optional pack root override.
 */
export declare function apply(ctx: Context, config?: Config): void;
export type { Config } from './config';
