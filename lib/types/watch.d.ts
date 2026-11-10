/**
 * Directory watching for the pack root.
 *
 * The registry caches completed catalogs per revision, so a newly cloned pack
 * is invisible until something calls `control.invalidate()`. Watching the pack
 * root is that something. Events are collapsed into one invalidation so a
 * `git checkout` or `git pull` storm does not trigger a scan per file.
 */
/** Handle for one running pack-root watcher. */
export interface PackWatcher {
    close: () => Promise<void>;
}
/** Tunables for tests and for slow filesystems. */
export interface WatchOptions {
    /** Milliseconds to wait for the event burst to settle before invalidating. */
    readonly debounceMs?: number;
    /** Milliseconds a file must stay unchanged before chokidar reports it. */
    readonly stabilityThresholdMs?: number;
    /** Poll interval used by chokidar's write-settle check. */
    readonly pollIntervalMs?: number;
}
/**
 * Watch the pack root and call `onChange` once per settled burst.
 * A missing root is not an error: the watcher waits for it to appear.
 * @param packRoot - absolute pack root path.
 * @param onChange - invalidation callback.
 * @param options - timing overrides.
 * @returns a handle whose `close()` stops watching and drops pending events.
 */
export declare function watchPackRoot(packRoot: string, onChange: () => void, options?: WatchOptions): PackWatcher;
