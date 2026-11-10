/**
 * The enable table: `<pack root>/settings.json` maps pack directory names to
 * booleans. Names are directory names, never namespaces, so renaming a
 * namespace inside a manifest does not orphan the entry.
 */
/** File name of the enable table in both user-level and project-level roots. */
export declare const SETTINGS_FILE = "settings.json";
/** Directory-name to enabled flag. A missing entry means "not enabled". */
export type EnableTable = ReadonlyMap<string, boolean>;
/** One settings file read: the parsed table plus anything worth reporting. */
export interface SettingsRead {
    readonly table: EnableTable;
    readonly problems: readonly string[];
}
/**
 * Read one settings file. A missing file is a normal empty table; malformed
 * content is reported without blocking startup.
 * @param path - absolute settings file path.
 * @returns the parsed table and any diagnostics.
 */
export declare function readEnableTable(path: string): Promise<SettingsRead>;
/** Merge tables with project-level entries overriding user-level ones. */
export declare function mergeTables(user: EnableTable, project: EnableTable): EnableTable;
/** Return whether a pack directory is switched on. */
export declare function isPackEnabled(table: EnableTable, directoryName: string): boolean;
/**
 * Walk up from `cwd` to the nearest ancestor containing `.git`, mirroring the
 * harness project-root rule. Falls back to `undefined` outside any repository.
 */
export declare function findProjectRoot(cwd: string): Promise<string | undefined>;
/** Absolute path of the project-level enable table for `cwd`, when there is one. */
export declare function projectSettingsPath(cwd: string | undefined): Promise<string | undefined>;
