import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { access, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import { mkdirSync } from "node:fs";
import chokidar from "chokidar";
// src/config.ts
/**
* Resolve the pack root. The default mirrors the harness layout: the user-level
* pack root lives next to the other host state, under `<dshHome>/dsh-skill-packs`.
* @param config - plugin configuration, if any.
* @param env - environment used for `DSH_HOME`; injectable for tests.
* @returns the resolved pack root.
*/
function resolveConfig(config, env = process.env) {
	if (config?.packRoot !== void 0) return { packRoot: resolve(config.packRoot) };
	const dshHome = config?.dshHome ?? env.DSH_HOME ?? join(homedir(), ".dsh");
	return { packRoot: join(dshHome, "dsh-skill-packs") };
}
// src/options.ts
/**
* Plugin options: `<pack root>/config.json`.
*
* The enable table (`settings.json`) stays hand-editable and boolean-only, so
* options live beside it in their own file. The configuration page reads and
* writes this file through the plugin's own HTTP routes; the harness config
* editor cannot see either file because it owns the profile patch.
*/
/** File name of the plugin options document in the pack root. */
const OPTIONS_FILE = "config.json";
/** Every accepted reference mode, in UI order. */
const REFERENCE_MODES = [
	"both",
	"note",
	"rewrite",
	"off"
];
/** Configuration used when the options file is missing or unreadable. */
const DEFAULT_PLUGIN_CONFIG = {
	references: { mode: "both" },
	packs: {}
};
/**
* Read the options file. A missing file is the normal default state.
* @param path - absolute options file path.
* @returns the parsed config and diagnostics.
*/
async function readOptions(path) {
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return {
			config: DEFAULT_PLUGIN_CONFIG,
			problems: []
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			config: DEFAULT_PLUGIN_CONFIG,
			problems: [`${path}: invalid JSON: ${messageOf$4(error)}`]
		};
	}
	const result = parsePluginConfig(parsed, path);
	return {
		config: result.config,
		problems: result.problems
	};
}
/**
* Validate a raw options document.
* @param value - parsed JSON value.
* @param label - path prefix used in diagnostics.
* @returns the accepted config and any diagnostics.
*/
function parsePluginConfig(value, label) {
	const problems = [];
	if (value === void 0) return {
		config: DEFAULT_PLUGIN_CONFIG,
		problems
	};
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		problems.push(`${label}: expected an object`);
		return {
			config: DEFAULT_PLUGIN_CONFIG,
			problems
		};
	}
	const fields = value;
	const references = parseReferenceConfig(fields.references, `${label}.references`, problems) ?? DEFAULT_PLUGIN_CONFIG.references;
	const packs = {};
	if (fields.packs !== void 0) {
		if (typeof fields.packs !== "object" || fields.packs === null || Array.isArray(fields.packs)) problems.push(`${label}.packs: expected an object keyed by pack directory`);
		else for (const [pack, raw] of Object.entries(fields.packs)) {
			const override = parsePackConfig(raw, `${label}.packs.${pack}`, problems);
			if (override !== void 0) packs[pack] = override;
		}
	}
	return {
		config: {
			references,
			packs
		},
		problems
	};
}
/** Resolve the effective reference mode for one pack directory. */
function resolveReferenceMode(config, pack) {
	return config.packs[pack]?.mode ?? config.references.mode;
}
/**
* Persist the options document through a temporary sibling, so a crash never
* truncates it.
* @param path - absolute options file path.
* @param config - config to write.
*/
async function writeOptions(path, config) {
	const document = {
		references: config.references,
		...Object.keys(config.packs).length === 0 ? {} : { packs: config.packs }
	};
	const temporary = join(dirname(path), `.config.${process.pid}.${Date.now()}.tmp`);
	await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
	await rename(temporary, path);
}
function parseReferenceConfig(value, label, problems) {
	if (value === void 0) return void 0;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		problems.push(`${label}: expected an object`);
		return;
	}
	const mode = value.mode;
	if (mode === void 0) return { mode: DEFAULT_PLUGIN_CONFIG.references.mode };
	if (!isReferenceMode(mode)) {
		problems.push(`${label}.mode: expected one of ${REFERENCE_MODES.join(", ")}`);
		return;
	}
	return { mode };
}
function parsePackConfig(value, label, problems) {
	if (value === void 0) return void 0;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		problems.push(`${label}: expected an object`);
		return;
	}
	const mode = value.mode;
	if (mode === void 0) return {};
	if (!isReferenceMode(mode)) {
		problems.push(`${label}.mode: expected one of ${REFERENCE_MODES.join(", ")}`);
		return {};
	}
	return { mode };
}
function isReferenceMode(value) {
	return typeof value === "string" && REFERENCE_MODES.includes(value);
}
function messageOf$4(error) {
	return error instanceof Error ? error.message : String(error);
}
// src/frontmatter.ts
const FRONTMATTER_DELIMITER = "---";
/**
* Parse one SKILL.md source.
* @param raw - complete file contents.
* @returns the parsed skill with its body, or a human-readable reason.
*/
function parseSkillFile(raw) {
	const split = splitFrontmatter(raw);
	if (split === void 0) return {
		ok: false,
		reason: "missing YAML frontmatter"
	};
	let data;
	try {
		data = parse(split.yaml);
	} catch (error) {
		return {
			ok: false,
			reason: `invalid YAML frontmatter: ${messageOf$3(error)}`
		};
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return {
		ok: false,
		reason: "invalid YAML frontmatter: expected a mapping"
	};
	const fields = data;
	const name = stringField(fields, "name");
	const description = stringField(fields, "description");
	if (name === void 0 || description === void 0) return {
		ok: false,
		reason: "frontmatter requires name and description"
	};
	let invocation;
	try {
		invocation = parseInvocationPolicy(fields);
	} catch (error) {
		return {
			ok: false,
			reason: `invalid invocation frontmatter: ${messageOf$3(error)}`
		};
	}
	const whenToUse = optionalString(fields, "whenToUse");
	const metadata = optionalMetadata(fields);
	return {
		ok: true,
		skill: {
			name,
			description,
			invocation,
			...whenToUse === void 0 ? {} : { whenToUse },
			...metadata === void 0 ? {} : { metadata }
		},
		body: split.body
	};
}
function splitFrontmatter(raw) {
	const firstLineEnd = raw.indexOf("\n");
	if (firstLineEnd < 0) return void 0;
	if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== FRONTMATTER_DELIMITER) return void 0;
	let lineStart = firstLineEnd + 1;
	while (lineStart <= raw.length) {
		const nextNewline = raw.indexOf("\n", lineStart);
		const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
		if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === FRONTMATTER_DELIMITER) {
			const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1;
			return {
				yaml: raw.slice(firstLineEnd + 1, lineStart),
				body: raw.slice(bodyStart)
			};
		}
		if (nextNewline < 0) return void 0;
		lineStart = nextNewline + 1;
	}
}
function parseInvocationPolicy(fields) {
	rejectLegacyKey(fields, "disableModelInvocation", "disable-model-invocation");
	rejectLegacyKey(fields, "modelInvocable", "disable-model-invocation");
	rejectLegacyKey(fields, "userInvocable", "user-invocable");
	const disableModelInvocation = booleanField(fields, "disable-model-invocation");
	const userInvocable = booleanField(fields, "user-invocable");
	return {
		modelInvocable: disableModelInvocation !== true,
		userInvocable: userInvocable !== false
	};
}
function rejectLegacyKey(fields, legacy, canonical) {
	if (Object.hasOwn(fields, legacy)) throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
}
function booleanField(fields, key) {
	if (!Object.hasOwn(fields, key)) return void 0;
	const value = fields[key];
	if (typeof value === "boolean") return value;
	if (value === 1 || value === "1") return true;
	if (value === 0 || value === "0") return false;
	if (typeof value === "string") switch (value.toLowerCase()) {
		case "true":
		case "yes":
		case "on": return true;
		case "false":
		case "no":
		case "off": return false;
	}
	throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}
function stringField(fields, key) {
	const value = fields[key];
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function optionalString(fields, key) {
	return stringField(fields, key);
}
function optionalMetadata(fields) {
	const value = fields.metadata;
	if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
}
function messageOf$3(error) {
	return error instanceof Error ? error.message : String(error);
}
// src/names.ts
/**
* Skill-name grammar, shared with the registry.
*
* The registry validates every candidate with `^[a-z0-9]+(?:-[a-z0-9]+)*$` and
* throws *outside* the guard around `provider.list()`, so one invalid name from
* this provider would break every catalog read — not just this pack's skills.
*
* Installed plugins cannot resolve `@deepseek-ai/*` at runtime (the profile's
* `node_modules` does not contain the harness packages), so the grammar is
* copied rather than imported. `tests/names.spec.ts` pins this copy against the
* real `isSkillName` so drift fails the suite instead of failing a session.
*/
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Return whether `value` is a name the skill registry will accept. */
function isSkillName(value) {
	return SKILL_NAME.test(value);
}
/**
* Normalize a namespace candidate: lower-case, `_`/`.`/whitespace to `-`,
* collapse runs, trim edges. Mirrors the published normalization rule.
*/
function normalizeNamePart(value) {
	return value.toLowerCase().replace(/[_.\s]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
/** Compose the registry identity of a pack skill. */
function canonicalName(namespace, skill) {
	return `${namespace}-${skill}`;
}
// src/packs.ts
/**
* Pack discovery: turn the pack root plus the enable table into skill records.
*
* Three pack modes are selected by marker files, in this order (ADR 0004):
* manifest (`.skill-pack/skills.json`), compat (`.claude-plugin/plugin.json`),
* discovery (bare `SKILL.md`, recursive). Everything this module returns is
* already validated against the registry grammar — the registry throws on an
* invalid candidate, so a bad pack must be dropped here, with a diagnostic.
*/
const SKILL_FILE = "SKILL.md";
const MANIFEST_FILE = join(".skill-pack", "skills.json");
const PLUGIN_FILE = join(".claude-plugin", "plugin.json");
const MARKETPLACE_FILE = join(".claude-plugin", "marketplace.json");
/** Directories never descended into by discovery mode or watched for changes. */
const IGNORED_DIRECTORY_NAMES = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".venv"
]);
/**
* Scan the pack root: apply the enable table, classify each enabled directory,
* collect its skills, and drop duplicate canonical names.
* @param options - pack root, enable table, abort signal, and sink for diagnostics.
* @returns every skill this provider should expose, plus diagnostics.
*/
async function scanPacks(options) {
	const problems = [];
	const directoryNames = await listPackDirectories(options.packRoot);
	for (const [key, enabled] of options.table) if (enabled && !directoryNames.includes(key)) problems.push(`pack root: enabled pack "${key}" has no directory`);
	const skills = [];
	const seen = /* @__PURE__ */ new Map();
	for (const directoryName of directoryNames) {
		options.signal?.throwIfAborted();
		if (options.table.get(directoryName) !== true) continue;
		const pack = await scanPack(join(options.packRoot, directoryName), directoryName, options.signal);
		if (pack === void 0) {
			if (options.table.get(directoryName) === true) problems.push(`pack "${directoryName}": enabled but holds no skill pack marker and no SKILL.md`);
			continue;
		}
		problems.push(...pack.problems);
		const siblings = pack.skills.map((skill) => ({
			name: bareName(skill.name, pack.namespace),
			canonical: skill.name,
			modelInvocable: skill.invocation.modelInvocable,
			userInvocable: skill.invocation.userInvocable
		}));
		for (const skill of pack.skills) {
			const owner = seen.get(skill.name);
			if (owner !== void 0) {
				problems.push(`pack "${pack.pack}": skill "${skill.name}" ignored because pack "${owner}" already exposed it`);
				continue;
			}
			seen.set(skill.name, pack.pack);
			skills.push({
				...skill,
				pack: pack.pack,
				namespace: pack.namespace,
				siblings
			});
		}
	}
	return {
		skills,
		problems
	};
}
/** List pack directory names, sorted, following symlinked pack directories. */
async function listPackDirectories(packRoot) {
	let entries;
	try {
		entries = await readdir(packRoot, { withFileTypes: true });
	} catch {
		return [];
	}
	const names = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		if (entry.isDirectory()) {
			names.push(entry.name);
			continue;
		}
		if (entry.isSymbolicLink() && await kindOf(join(packRoot, entry.name)) === "dir") names.push(entry.name);
	}
	return names.sort((left, right) => left.localeCompare(right));
}
/**
* Classify and scan one pack directory.
* @returns the scan, or `undefined` when the directory is not a pack at all.
*/
async function scanPack(packDirectory, directoryName, signal) {
	const hasManifest = await kindOf(join(packDirectory, MANIFEST_FILE)) === "file";
	const hasPlugin = await kindOf(join(packDirectory, PLUGIN_FILE)) === "file";
	const hasMarketplace = await kindOf(join(packDirectory, MARKETPLACE_FILE)) === "file";
	if (hasManifest) {
		const scan = await scanManifestPack(packDirectory, directoryName);
		if (!hasPlugin) return scan;
		return {
			...scan,
			problems: [...scan.problems, `pack "${directoryName}": has both .skill-pack/skills.json and .claude-plugin/plugin.json; manifest wins`]
		};
	}
	if (hasPlugin) return scanCompatPack(packDirectory, directoryName);
	if (hasMarketplace) return {
		pack: directoryName,
		mode: "compat",
		namespace: normalizeNamePart(directoryName),
		skills: [],
		problems: [`pack "${directoryName}": marketplace-only repository (no plugin.json) is not expanded in v1`]
	};
	const scanned = await scanDiscoveryPack(packDirectory, directoryName, signal);
	if (scanned.skills.length === 0 && scanned.problems.length === 0) return void 0;
	return scanned;
}
async function scanManifestPack(packDirectory, directoryName) {
	const manifestPath = join(packDirectory, MANIFEST_FILE);
	const problems = [];
	const read = await readJson(manifestPath);
	if (read === void 0) return failed(directoryName, "manifest", [`${manifestPath}: unreadable`]);
	if (!read.ok) return failed(directoryName, "manifest", [`${manifestPath}: ${read.reason}`]);
	if (typeof read.value !== "object" || read.value === null || Array.isArray(read.value)) return failed(directoryName, "manifest", [`${manifestPath}: expected an object`]);
	const fields = read.value;
	const declaredName = stringOr(fields.name, directoryName);
	const namespace = normalizeNamePart(declaredName);
	if (!isSkillName(namespace)) return failed(directoryName, "manifest", [`pack "${directoryName}": namespace "${declaredName}" normalizes to invalid "${namespace}"`]);
	const entries = fields.skills;
	if (entries === void 0) return {
		pack: directoryName,
		mode: "manifest",
		namespace,
		skills: [],
		problems
	};
	if (!Array.isArray(entries)) return failed(directoryName, "manifest", [`${manifestPath}: "skills" must be an array`]);
	return {
		pack: directoryName,
		mode: "manifest",
		namespace,
		skills: await collectListedSkills(entries, packDirectory, namespace, problems),
		problems
	};
}
async function scanCompatPack(packDirectory, directoryName) {
	const pluginPath = join(packDirectory, PLUGIN_FILE);
	const read = await readJson(pluginPath);
	if (read === void 0) return void 0;
	if (!read.ok) return failed(directoryName, "compat", [`${pluginPath}: ${read.reason}`]);
	if (typeof read.value !== "object" || read.value === null || Array.isArray(read.value)) return failed(directoryName, "compat", [`${pluginPath}: expected an object`]);
	const fields = read.value;
	const declaredName = stringOr(fields.name, directoryName);
	const namespace = normalizeNamePart(declaredName);
	if (!isSkillName(namespace)) return failed(directoryName, "compat", [`pack "${directoryName}": namespace "${declaredName}" normalizes to invalid "${namespace}"`]);
	const problems = [];
	const skillsRoot = join(packDirectory, "skills");
	const hasSkillsDirectory = await kindOf(skillsRoot) === "dir";
	const hasSkillsKey = Object.hasOwn(fields, "skills");
	const rootSkillFile = join(packDirectory, SKILL_FILE);
	if (!hasSkillsDirectory && !hasSkillsKey && await kindOf(rootSkillFile) === "file") {
		const single = await readSkillAt(packDirectory, namespace);
		if ("problem" in single) return failed(directoryName, "compat", [single.problem]);
		return {
			pack: directoryName,
			mode: "compat",
			namespace,
			skills: [{
				...single.skill,
				name: namespace
			}],
			problems
		};
	}
	const skills = [];
	if (hasSkillsKey) {
		if (!Array.isArray(fields.skills)) problems.push(`${pluginPath}: "skills" must be an array`);
		else skills.push(...await collectListedSkills(fields.skills, packDirectory, namespace, problems));
	}
	if (hasSkillsDirectory) for (const entry of await sortedEntries(skillsRoot)) {
		if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
		const skillDirectory = join(skillsRoot, entry.name);
		if (await kindOf(join(skillDirectory, SKILL_FILE)) !== "file") continue;
		const read = await readSkillAt(skillDirectory, namespace);
		if ("problem" in read) problems.push(read.problem);
		else skills.push(read.skill);
	}
	return {
		pack: directoryName,
		mode: "compat",
		namespace,
		skills: dedupe(skills, problems),
		problems
	};
}
async function scanDiscoveryPack(packDirectory, directoryName, signal) {
	const problems = [];
	const namespace = normalizeNamePart(directoryName);
	if (!isSkillName(namespace)) return failed(directoryName, "discovery", [`pack "${directoryName}": directory name normalizes to invalid namespace "${namespace}"`]);
	const skills = [];
	await walk(packDirectory);
	return {
		pack: directoryName,
		mode: "discovery",
		namespace,
		skills: dedupe(skills, problems),
		problems
	};
	async function walk(directory) {
		signal?.throwIfAborted();
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch (error) {
			problems.push(`${directory}: unreadable (${messageOf$2(error)})`);
			return;
		}
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
				await walk(path);
				continue;
			}
			if (!entry.isFile() || entry.name !== SKILL_FILE) continue;
			const read = await readSkillAt(directory, namespace);
			if ("problem" in read) problems.push(read.problem);
			else skills.push(read.skill);
		}
	}
}
/** Read `skills[]` style path entries shared by manifest and compat modes. */
async function collectListedSkills(entries, packDirectory, namespace, problems) {
	const skills = [];
	for (const entry of entries) {
		if (typeof entry !== "string" || entry.length === 0) {
			problems.push(`skills[] entries must be non-empty strings`);
			continue;
		}
		if (entry.includes("*")) {
			problems.push(`${entry}: globs are not supported`);
			continue;
		}
		const target = resolve(packDirectory, entry);
		if (!isStrictlyInside(packDirectory, target)) {
			problems.push(`${entry}: escapes the pack root`);
			continue;
		}
		if (await kindOf(target) !== "dir") {
			problems.push(`${entry}: not a directory`);
			continue;
		}
		const read = await readSkillAt(target, namespace);
		if ("problem" in read) problems.push(read.problem);
		else skills.push(read.skill);
	}
	return dedupe(skills, problems);
}
/** Parse one skill directory into a validated record. */
async function readSkillAt(directory, namespace) {
	const skillFile = join(directory, SKILL_FILE);
	let raw;
	try {
		raw = await readFile(skillFile, "utf8");
	} catch (error) {
		return { problem: `${skillFile}: unreadable (${messageOf$2(error)})` };
	}
	const parsed = parseSkillFile(raw);
	if (!parsed.ok) return { problem: `${skillFile}: ${parsed.reason}` };
	if (!isSkillName(parsed.skill.name)) return { problem: `${skillFile}: invalid skill name "${parsed.skill.name}"` };
	const name = canonicalName(namespace, parsed.skill.name);
	if (!isSkillName(name)) return { problem: `${skillFile}: canonical name "${name}" is invalid` };
	return { skill: {
		name,
		description: parsed.skill.description,
		invocation: parsed.skill.invocation,
		skillFile,
		directory,
		...parsed.skill.whenToUse === void 0 ? {} : { whenToUse: parsed.skill.whenToUse },
		...parsed.skill.metadata === void 0 ? {} : { metadata: parsed.skill.metadata }
	} };
}
function dedupe(skills, problems) {
	const seen = /* @__PURE__ */ new Set();
	const kept = [];
	for (const skill of skills) {
		if (seen.has(skill.name)) {
			problems.push(`skill "${skill.name}" ignored because an earlier skill in the same pack already used that name`);
			continue;
		}
		seen.add(skill.name);
		kept.push(skill);
	}
	return kept;
}
function failed(directoryName, mode, problems) {
	return {
		pack: directoryName,
		mode,
		namespace: normalizeNamePart(directoryName),
		skills: [],
		problems
	};
}
async function sortedEntries(directory) {
	try {
		return (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
	} catch {
		return [];
	}
}
async function kindOf(path) {
	try {
		const stats = await stat(path);
		if (stats.isDirectory()) return "dir";
		if (stats.isFile()) return "file";
		return;
	} catch {
		return;
	}
}
async function readJson(path) {
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return;
	}
	try {
		return {
			ok: true,
			value: JSON.parse(raw)
		};
	} catch (error) {
		return {
			ok: false,
			reason: `invalid JSON: ${messageOf$2(error)}`
		};
	}
}
function stringOr(value, fallback) {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}
/** Strip the namespace prefix from a canonical name. */
function bareName(canonical, namespace) {
	const prefix = `${namespace}-`;
	return canonical.startsWith(prefix) ? canonical.slice(prefix.length) : canonical;
}
/** Whether `candidate` is inside `root` (and not the root itself). */
function isStrictlyInside(root, candidate) {
	const path = relative(root, candidate);
	return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}
function messageOf$2(error) {
	return error instanceof Error ? error.message : String(error);
}
// src/references.ts
/**
* Apply the reference policy to one skill body.
* @param options - body text, owning pack, skill identity, siblings and mode.
* @returns the (possibly prefixed and rewritten) body plus diagnostics counts.
*/
function applyReferencePolicy(options) {
	const siblings = options.siblings.filter((sibling) => sibling.canonical !== options.self);
	if (options.mode === "off" || siblings.length === 0) return {
		content: options.body,
		rewritten: 0,
		residual: []
	};
	const byName = new Map(siblings.map((sibling) => [sibling.name, sibling]));
	let rewritten = 0;
	const rewriteSlash = options.mode === "both" || options.mode === "rewrite";
	const rewriteQuotes = rewriteSlash;
	const rewrittenBody = options.body.split("\n").map((line) => {
		let next = line;
		if (rewriteSlash) next = next.replace(/(?<![:/])\/([a-z0-9][a-z0-9-]*)/g, (match, bare) => {
			const sibling = byName.get(bare);
			if (sibling === void 0 || !sibling.userInvocable) return match;
			rewritten += 1;
			return `/${sibling.canonical}`;
		});
		if (rewriteQuotes && /skill/i.test(next)) next = next.replace(/(["'])([a-z0-9][a-z0-9-]*)\1/g, (match, quote, bare) => {
			const sibling = byName.get(bare);
			if (sibling === void 0 || !sibling.modelInvocable) return match;
			rewritten += 1;
			return `${quote}${sibling.canonical}${quote}`;
		});
		return next;
	}).join("\n");
	const residual = siblings.map((sibling) => sibling.name).filter((name) => appearsBare(rewrittenBody, name));
	if (options.mode === "both" || options.mode === "note") {
		if (residual.length > 0) return {
			content: `${namespaceRule(options.namespace, residual[0] ?? "")}\n\n${rewrittenBody}`,
			rewritten,
			residual
		};
	}
	return {
		content: rewrittenBody,
		rewritten,
		residual
	};
}
/** Whether `name` appears in `text` outside a longer kebab token or a prefixed name. */
function appearsBare(text, name) {
	return new RegExp(`(?<![a-z0-9-])${escapeRegExp(name)}(?![a-z0-9-])`).test(text);
}
function namespaceRule(namespace, example) {
	return `> **Pack namespace.** This skill belongs to the pack \`${namespace}\`; same-pack skills referenced here are registered with a \`${namespace}-\` prefix (for example \`${example}\` → \`${namespace}-${example}\`). When a bare name in this text refers to a skill rather than an ordinary word, use the prefixed name.`;
}
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// src/settings.ts
/**
* The enable table: `<pack root>/settings.json` maps pack directory names to
* booleans. Names are directory names, never namespaces, so renaming a
* namespace inside a manifest does not orphan the entry.
*
* This file is intentionally hand-editable and holds nothing else: plugin
* options live in `<pack root>/config.json` so the configuration page never has
* to rewrite the table.
*/
/** File name of the enable table in both user-level and project-level roots. */
const SETTINGS_FILE = "settings.json";
/**
* Read one settings file. A missing file is a normal empty table; malformed
* content is reported without blocking startup.
* @param path - absolute settings file path.
* @returns the parsed table and any diagnostics.
*/
async function readEnableTable(path) {
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return {
			table: /* @__PURE__ */ new Map(),
			problems: []
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			table: /* @__PURE__ */ new Map(),
			problems: [`${path}: invalid JSON: ${messageOf$1(error)}`]
		};
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {
		table: /* @__PURE__ */ new Map(),
		problems: [`${path}: expected an object of directory names`]
	};
	const table = /* @__PURE__ */ new Map();
	const problems = [];
	for (const [key, value] of Object.entries(parsed)) {
		if (typeof value !== "boolean") {
			problems.push(`${path}: "${key}" must be true or false`);
			continue;
		}
		table.set(key, value);
	}
	return {
		table,
		problems
	};
}
/** Merge tables with project-level entries overriding user-level ones. */
function mergeTables(user, project) {
	if (project.size === 0) return user;
	const merged = new Map(user);
	for (const [key, value] of project) merged.set(key, value);
	return merged;
}
/**
* Walk up from `cwd` to the nearest ancestor containing `.git`, mirroring the
* harness project-root rule. Falls back to `undefined` outside any repository.
*/
async function findProjectRoot(cwd) {
	let current = cwd;
	for (;;) {
		if (await pathExists(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return void 0;
		current = parent;
	}
}
/** Absolute path of the project-level enable table for `cwd`, when there is one. */
async function projectSettingsPath(cwd) {
	if (cwd === void 0) return void 0;
	const root = await findProjectRoot(cwd);
	return root === void 0 ? void 0 : join(root, ".dsh", "dsh-skill-packs", SETTINGS_FILE);
}
async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
function messageOf$1(error) {
	return error instanceof Error ? error.message : String(error);
}
// src/provider.ts
/**
* The `skill-packs` provider: scan enabled packs, hand validated candidates to
* the registry, and load bodies lazily.
*
* Candidates are summaries; the registry calls `get()` only when a skill is
* actually used, so listing a large pack stays cheap. `get()` also applies the
* reference policy: same-pack references are rewritten to canonical names, and
* a namespace rule is prepended when a bare name survives.
*/
/** Registry-unique provider name; `filesystem` and `runtime` are taken by core. */
const PROVIDER_NAME = "skill-packs";
/** Source label carried by every candidate this provider contributes. */
const PACK_SOURCE = "skill-packs";
/**
* Build the provider this plugin registers.
*
* The registry does not validate candidates for us: a malformed one throws out
* of the whole catalog read, so everything returned here must already be valid.
* @param options - resolved config and diagnostics sink.
* @returns a provider over the configured pack root.
*/
function createProvider(options) {
	let pluginConfig = DEFAULT_PLUGIN_CONFIG;
	return {
		name: PROVIDER_NAME,
		list: async (lookup) => {
			const table = await loadEnableTable(options.config.packRoot, lookup.cwd, options.warn);
			const read = await readOptions(join(options.config.packRoot, OPTIONS_FILE));
			for (const problem of read.problems) options.warn(problem);
			pluginConfig = read.config;
			const batch = await scanPacks({
				packRoot: options.config.packRoot,
				table,
				signal: lookup.signal
			});
			for (const problem of batch.problems) options.warn(problem);
			return batch.skills.map(toCandidate);
		},
		get: async (candidate) => {
			const locator = asLocator(candidate.locator);
			if (locator === void 0) return void 0;
			let raw;
			try {
				raw = await readFile(locator.skillFile, "utf8");
			} catch {
				return;
			}
			const parsed = parseSkillFile(raw);
			if (!parsed.ok) return void 0;
			const applied = applyReferencePolicy({
				body: parsed.body,
				namespace: locator.namespace,
				self: candidate.name,
				siblings: locator.siblings,
				mode: resolveReferenceMode(pluginConfig, locator.pack)
			});
			return {
				name: candidate.name,
				description: parsed.skill.description,
				invocation: parsed.skill.invocation,
				provider: PROVIDER_NAME,
				source: PACK_SOURCE,
				path: locator.skillFile,
				resourceBase: {
					kind: "directory",
					path: locator.directory
				},
				content: applied.content,
				...parsed.skill.whenToUse === void 0 ? {} : { whenToUse: parsed.skill.whenToUse },
				...parsed.skill.metadata === void 0 ? {} : { metadata: parsed.skill.metadata }
			};
		}
	};
}
async function loadEnableTable(packRoot, cwd, warn) {
	const userRead = await readEnableTable(join(packRoot, SETTINGS_FILE));
	for (const problem of userRead.problems) warn(problem);
	const projectPath = await projectSettingsPath(cwd);
	if (projectPath === void 0) return userRead.table;
	const projectRead = await readEnableTable(projectPath);
	for (const problem of projectRead.problems) warn(problem);
	return mergeTables(userRead.table, projectRead.table);
}
function toCandidate(skill) {
	const locator = {
		kind: "pack-skill",
		skillFile: skill.skillFile,
		directory: skill.directory,
		pack: skill.pack,
		namespace: skill.namespace,
		siblings: skill.siblings
	};
	return {
		name: skill.name,
		description: skill.description,
		invocation: skill.invocation,
		provider: PROVIDER_NAME,
		source: PACK_SOURCE,
		path: skill.skillFile,
		resourceBase: {
			kind: "directory",
			path: skill.directory
		},
		rank: 450,
		locator,
		...skill.whenToUse === void 0 ? {} : { whenToUse: skill.whenToUse },
		...skill.metadata === void 0 ? {} : { metadata: skill.metadata }
	};
}
function asLocator(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const locator = value;
	if (locator.kind !== "pack-skill") return void 0;
	if (typeof locator.skillFile !== "string" || typeof locator.directory !== "string") return void 0;
	if (typeof locator.pack !== "string" || typeof locator.namespace !== "string") return void 0;
	if (!Array.isArray(locator.siblings)) return void 0;
	return {
		kind: "pack-skill",
		skillFile: locator.skillFile,
		directory: locator.directory,
		pack: locator.pack,
		namespace: locator.namespace,
		siblings: locator.siblings
	};
}
// src/watch.ts
/**
* Directory watching for the pack root.
*
* The registry caches completed catalogs per revision, so a newly cloned pack
* is invisible until something calls `control.invalidate()`. Watching the pack
* root is that something. Events are collapsed into one invalidation so a
* `git checkout` or `git pull` storm does not trigger a scan per file.
*/
const WATCH_DEPTH = 8;
/**
* Watch the pack root and call `onChange` once per settled burst.
* A missing root is not an error: the watcher waits for it to appear.
* @param packRoot - absolute pack root path.
* @param onChange - invalidation callback.
* @param options - timing overrides.
* @returns a handle whose `close()` stops watching and drops pending events.
*/
function watchPackRoot(packRoot, onChange, options = {}) {
	const debounceMs = options.debounceMs ?? 100;
	try {
		mkdirSync(packRoot, { recursive: true });
	} catch {}
	const watcher = chokidar.watch(packRoot, {
		persistent: true,
		ignoreInitial: true,
		followSymlinks: false,
		atomic: true,
		depth: WATCH_DEPTH,
		ignored: (path) => isIgnoredPath(path),
		awaitWriteFinish: {
			stabilityThreshold: options.stabilityThresholdMs ?? 200,
			pollInterval: options.pollIntervalMs ?? 100
		}
	});
	let timer;
	const schedule = () => {
		if (timer !== void 0) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = void 0;
			onChange();
		}, debounceMs);
	};
	watcher.on("add", schedule).on("change", schedule).on("unlink", schedule).on("addDir", schedule).on("unlinkDir", schedule).on("error", () => {});
	return { close: async () => {
		if (timer !== void 0) {
			clearTimeout(timer);
			timer = void 0;
		}
		await watcher.close();
	} };
}
function isIgnoredPath(path) {
	const segments = path.split(/[\\/]/);
	for (const segment of segments) if (segment.length > 0 && IGNORED_DIRECTORY_NAMES.has(segment)) return true;
	return false;
}
// src/index.ts
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
/** Cordis plugin name. */
const name = "skill-packs";
/** Service this plugin needs before it can register anything. */
const inject = ["skills"];
/**
* Register the pack provider, watch the pack root, and serve the settings page.
* @param ctx - host context carrying the skill registry.
* @param config - optional pack root override.
*/
function apply(ctx, config) {
	const resolved = resolveConfig(config);
	const paths = {
		packRoot: resolved.packRoot,
		settingsPath: join(resolved.packRoot, SETTINGS_FILE),
		configPath: join(resolved.packRoot, OPTIONS_FILE)
	};
	const warn = (message) => {
		ctx.logger.warn(`skill-packs: ${message}`);
	};
	const provider = createProvider({
		config: resolved,
		warn
	});
	let invalidate;
	ctx.skills.registerProvider((control) => {
		invalidate = control.invalidate;
		return provider;
	});
	ctx.effect(() => {
		const watcher = watchPackRoot(resolved.packRoot, () => {
			invalidate?.();
		});
		return () => {
			watcher.close();
		};
	});
	const pendingRoutes = [];
	const route = (path, handler) => {
		pendingRoutes.push({
			path,
			handler
		});
	};
	const injectable = ctx;
	route("/skill-packs/state", (request, response) => {
		if (!isLoopback(request)) return sendJson(response, 403, { error: "loopback only" });
		if (request.method !== "GET") return sendJson(response, 405, { error: "method not allowed" });
		statePayload(paths).then((payload) => sendJson(response, 200, payload)).catch((error) => sendJson(response, 500, { error: messageOf(error) }));
	});
	route("/skill-packs/save", (request, response) => {
		if (!isLoopback(request)) return sendJson(response, 403, { error: "loopback only" });
		if (request.method !== "POST") return sendJson(response, 405, { error: "method not allowed" });
		(async () => {
			const parsed = parsePluginConfig((await readJsonBody(request)).config, "config");
			if (parsed.problems.length > 0) {
				sendJson(response, 400, { error: parsed.problems.join("; ") });
				return;
			}
			await writeOptions(paths.configPath, parsed.config);
			invalidate?.();
			sendJson(response, 200, await statePayload(paths));
		})().catch((error) => sendJson(response, 400, { error: messageOf(error) }));
	});
	route("/skill-packs/reset", (request, response) => {
		if (!isLoopback(request)) return sendJson(response, 403, { error: "loopback only" });
		if (request.method !== "POST") return sendJson(response, 405, { error: "method not allowed" });
		(async () => {
			await writeOptions(paths.configPath, DEFAULT_PLUGIN_CONFIG);
			invalidate?.();
			sendJson(response, 200, await statePayload(paths));
		})().catch((error) => sendJson(response, 400, { error: messageOf(error) }));
	});
	injectable.inject(["webServer"], (web) => {
		for (const pending of pendingRoutes) web.effect(() => web.webServer.register({
			kind: "exact",
			path: pending.path,
			handler: pending.handler
		}));
		ctx.logger.info(`skill-packs: ${pendingRoutes.length} configuration routes registered`);
	});
}
async function statePayload(paths) {
	const settings = await readEnableTable(paths.settingsPath);
	const options = await readOptions(paths.configPath);
	const packs = {};
	for (const [key, value] of [...settings.table].sort(([left], [right]) => left.localeCompare(right))) packs[key] = value;
	return {
		config: options.config,
		packs,
		packRoot: paths.packRoot,
		settingsPath: paths.settingsPath,
		configPath: paths.configPath
	};
}
function isLoopback(request) {
	const address = request.socket?.remoteAddress ?? "";
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function sendJson(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
async function readJsonBody(request) {
	const chunks = [];
	await new Promise((resolve, reject) => {
		request.on("data", (chunk) => {
			chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		});
		request.on("end", () => {
			resolve();
		});
		request.on("error", (error) => {
			reject(error);
		});
	});
	const raw = chunks.join("");
	if (raw.length === 0) return {};
	const parsed = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("body must be a JSON object");
	return parsed;
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
export { apply, inject, name };
