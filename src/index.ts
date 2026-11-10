/**
 * `dsh-skill-packs` — mount whole skill repositories into the harness.
 *
 * This plugin owns a sibling provider in `ctx.skills`; it never replaces or
 * reconfigures `skill-filesystem`, and it never injects skill bodies itself.
 * Core's `/name` gesture, the `skill` tool and the client menu all read the
 * registry, so putting names there is the whole job (ADR 0005).
 * @module dsh-skill-packs
 */

import type { Context } from '@deepseek-ai/cordis'

import { type Config, resolveConfig } from './config'
import { createProvider } from './provider'
import { watchPackRoot } from './watch'

/** Cordis plugin name. */
export const name = 'skill-packs'
/** Service this plugin needs before it can register anything. */
export const inject = ['skills']

/**
 * Register the pack provider and watch the pack root for changes.
 *
 * The watcher calls `control.invalidate()` so a freshly cloned pack shows up in
 * the current session instead of the next one. Disposing the plugin unregisters
 * the provider (its names disappear) and closes the watcher.
 * @param ctx - host context carrying the skill registry.
 * @param config - optional pack root override.
 */
export function apply(ctx: Context, config?: Config): void {
  const resolved = resolveConfig(config)
  const warn = (message: string): void => {
    ctx.logger.warn(`skill-packs: ${message}`)
  }

  const provider = createProvider({ config: resolved, warn })
  let invalidate: (() => void) | undefined
  ctx.skills.registerProvider((control) => {
    invalidate = control.invalidate
    return provider
  })

  ctx.effect(() => {
    const watcher = watchPackRoot(resolved.packRoot, () => {
      invalidate?.()
    })
    return () => {
      void watcher.close()
    }
  })
}

export type { Config } from './config'
