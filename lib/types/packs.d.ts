/**
 * Pack discovery: turn the pack root plus the enable table into skill records.
 *
 * Three pack modes are selected by marker files, in this order (ADR 0004):
 * manifest (`.skill-pack/skills.json`), compat (`.claude-plugin/plugin.json`),
 * discovery (bare `SKILL.md`, recursive). Everything this module returns is
 * already validated against the registry grammar — the registry throws on an
 * invalid candidate, so a bad pack must be dropped here, with a diagnostic.
 */
import type { SkillInvocationPolicy } from '@deepseek-ai/dsh-skill';
import type { SiblingSkill } from './references';
import type { EnableTable } from './settings';
/** Which marker decided how a pack is interpreted. */
export type PackMode = 'manifest' | 'compat' | 'discovery';
/** One skill resolved from a pack, addressed by its canonical registry name. */
export interface PackSkill {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly invocation: SkillInvocationPolicy;
    readonly skillFile: string;
    readonly directory: string;
    readonly metadata?: Record<string, unknown>;
}
/** Outcome of scanning one pack directory. */
export interface PackScan {
    readonly pack: string;
    readonly mode: PackMode;
    readonly namespace: string;
    readonly skills: readonly PackSkill[];
    readonly problems: readonly string[];
}
/** A pack skill plus the context `get()` needs to resolve in-body references. */
export interface ResolvedSkill extends PackSkill {
    readonly pack: string;
    readonly namespace: string;
    readonly siblings: readonly SiblingSkill[];
}
/** Aggregate outcome of scanning the whole pack root. */
export interface PackScanBatch {
    readonly skills: readonly ResolvedSkill[];
    readonly problems: readonly string[];
}
/** Directories never descended into by discovery mode or watched for changes. */
export declare const IGNORED_DIRECTORY_NAMES: ReadonlySet<string>;
/**
 * Scan the pack root: apply the enable table, classify each enabled directory,
 * collect its skills, and drop duplicate canonical names.
 * @param options - pack root, enable table, abort signal, and sink for diagnostics.
 * @returns every skill this provider should expose, plus diagnostics.
 */
export declare function scanPacks(options: {
    readonly packRoot: string;
    readonly table: EnableTable;
    readonly signal?: AbortSignal | undefined;
}): Promise<PackScanBatch>;
/** List pack directory names, sorted, following symlinked pack directories. */
export declare function listPackDirectories(packRoot: string): Promise<string[]>;
/**
 * Classify and scan one pack directory.
 * @returns the scan, or `undefined` when the directory is not a pack at all.
 */
export declare function scanPack(packDirectory: string, directoryName: string, signal?: AbortSignal | undefined): Promise<PackScan | undefined>;
