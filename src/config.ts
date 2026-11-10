import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** User-facing plugin configuration (all fields optional). */
export interface Config {
  /** Pack root directory; defaults to `<dshHome>/dsh-skill-packs`. */
  readonly packRoot?: string
  /** Harness config root used when `packRoot` is absent; defaults to `$DSH_HOME` or `~/.dsh`. */
  readonly dshHome?: string
}

/** Configuration with every path resolved. */
export interface ResolvedConfig {
  readonly packRoot: string
}

/**
 * Resolve the pack root. The default mirrors the harness layout: the user-level
 * pack root lives next to the other host state, under `<dshHome>/dsh-skill-packs`.
 * @param config - plugin configuration, if any.
 * @param env - environment used for `DSH_HOME`; injectable for tests.
 * @returns the resolved pack root.
 */
export function resolveConfig(
  config: Config | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedConfig {
  if (config?.packRoot !== undefined) return { packRoot: resolve(config.packRoot) }
  const dshHome = config?.dshHome ?? env.DSH_HOME ?? join(homedir(), '.dsh')
  return { packRoot: join(dshHome, 'dsh-skill-packs') }
}
