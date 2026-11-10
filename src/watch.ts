/**
 * Directory watching for the pack root.
 *
 * The registry caches completed catalogs per revision, so a newly cloned pack
 * is invisible until something calls `control.invalidate()`. Watching the pack
 * root is that something. Events are collapsed into one invalidation so a
 * `git checkout` or `git pull` storm does not trigger a scan per file.
 */

import { mkdirSync } from 'node:fs'

import chokidar from 'chokidar'

import { IGNORED_DIRECTORY_NAMES } from './packs'

/** Handle for one running pack-root watcher. */
export interface PackWatcher {
  close: () => Promise<void>
}

/** Tunables for tests and for slow filesystems. */
export interface WatchOptions {
  /** Milliseconds to wait for the event burst to settle before invalidating. */
  readonly debounceMs?: number
  /** Milliseconds a file must stay unchanged before chokidar reports it. */
  readonly stabilityThresholdMs?: number
  /** Poll interval used by chokidar's write-settle check. */
  readonly pollIntervalMs?: number
}

const WATCH_DEPTH = 8

/**
 * Watch the pack root and call `onChange` once per settled burst.
 * A missing root is not an error: the watcher waits for it to appear.
 * @param packRoot - absolute pack root path.
 * @param onChange - invalidation callback.
 * @param options - timing overrides.
 * @returns a handle whose `close()` stops watching and drops pending events.
 */
export function watchPackRoot(
  packRoot: string,
  onChange: () => void,
  options: WatchOptions = {},
): PackWatcher {
  const debounceMs = options.debounceMs ?? 100
  // Chokidar needs a path to watch; creating the owned pack root is safe and
  // makes the fresh-install case (no pack root yet) work without a restart.
  try {
    mkdirSync(packRoot, { recursive: true })
  } catch {
    // A read-only or otherwise unavailable root surfaces as a watcher error.
  }
  const watcher = chokidar.watch(packRoot, {
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    atomic: true,
    depth: WATCH_DEPTH,
    ignored: (path: string) => isIgnoredPath(path),
    awaitWriteFinish: {
      stabilityThreshold: options.stabilityThresholdMs ?? 200,
      pollInterval: options.pollIntervalMs ?? 100,
    },
  })

  let timer: NodeJS.Timeout | undefined
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onChange()
    }, debounceMs)
  }

  watcher
    .on('add', schedule)
    .on('change', schedule)
    .on('unlink', schedule)
    .on('addDir', schedule)
    .on('unlinkDir', schedule)
    // Watcher errors (including a missing root) must not abort the provider.
    .on('error', () => {})

  return {
    close: async () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      await watcher.close()
    },
  }
}

function isIgnoredPath(path: string): boolean {
  const segments = path.split(/[\\/]/)
  for (const segment of segments) {
    if (segment.length > 0 && IGNORED_DIRECTORY_NAMES.has(segment)) return true
  }
  return false
}
