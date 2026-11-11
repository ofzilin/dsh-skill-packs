/**
 * Plugin options: `<pack root>/config.json`.
 *
 * The enable table (`settings.json`) stays hand-editable and boolean-only, so
 * options live beside it in their own file. The configuration page reads and
 * writes this file through the plugin's own HTTP routes; the harness config
 * editor cannot see either file because it owns the profile patch.
 */
/** File name of the plugin options document in the pack root. */
export declare const OPTIONS_FILE = "config.json";
/** How references to same-pack skills are treated inside a loaded body. */
export type ReferenceMode = 'both' | 'note' | 'rewrite' | 'off';
/** Every accepted reference mode, in UI order. */
export declare const REFERENCE_MODES: readonly ReferenceMode[];
/** Default reference handling for every pack. */
export interface ReferenceConfig {
    readonly mode: ReferenceMode;
}
/** Per-pack override; an omitted mode inherits the global one. */
export interface PackConfig {
    readonly mode?: ReferenceMode;
}
/** The complete options document. */
export interface PluginConfig {
    readonly references: ReferenceConfig;
    readonly packs: Readonly<Record<string, PackConfig>>;
}
/** Configuration used when the options file is missing or unreadable. */
export declare const DEFAULT_PLUGIN_CONFIG: PluginConfig;
/** One options read: the config plus anything worth reporting. */
export interface OptionsRead {
    readonly config: PluginConfig;
    readonly problems: readonly string[];
}
/**
 * Read the options file. A missing file is the normal default state.
 * @param path - absolute options file path.
 * @returns the parsed config and diagnostics.
 */
export declare function readOptions(path: string): Promise<OptionsRead>;
/**
 * Validate a raw options document.
 * @param value - parsed JSON value.
 * @param label - path prefix used in diagnostics.
 * @returns the accepted config and any diagnostics.
 */
export declare function parsePluginConfig(value: unknown, label: string): {
    config: PluginConfig;
    problems: string[];
};
/** Resolve the effective reference mode for one pack directory. */
export declare function resolveReferenceMode(config: PluginConfig, pack: string): ReferenceMode;
/**
 * Persist the options document through a temporary sibling, so a crash never
 * truncates it.
 * @param path - absolute options file path.
 * @param config - config to write.
 */
export declare function writeOptions(path: string, config: PluginConfig): Promise<void>;
