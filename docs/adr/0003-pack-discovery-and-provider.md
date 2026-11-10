# compat mode：Claude 插件仓的识别与发现

**Status**: accepted

根目录存在 `.claude-plugin/plugin.json` 时按 Claude 语义解释：skill 来自 manifest 的 `skills[]`（**追加**到默认扫描，不是替换）加上 `skills/*/SKILL.md`；根有 `SKILL.md` 且既无 `skills/` 也无 `skills` 键时整包当一个 skill。skill 名取 frontmatter 的 `name`。provider 必须自己先校验再交出候选——core 收到非法名会抛错并跳过**整个 provider**，一条坏 frontmatter 能让所有 pack 消失。

## Considered Options

- 用目录名当 skill 名：与 core 行为不一致，也丢掉"改 frontmatter 不改目录"的能力。
- 忽略 `skills[]`、只平扫 `skills/`：Claude 里 `skills[]` 本来就是追加，忽略会让带分类目录的仓行为不同。
- 让 compat mode 也吃 `.skill-pack/skills.json`：那是 manifest mode 的职责，见 ADR 0004。

## Consequences

- 只有 `marketplace.json` 的仓在 v1 不展开（一个仓装 N 个 plugin），只出诊断。
- frontmatter 缺 `name` 或名字非法 → 丢该 skill 并 warn，不能让 provider 整体失败。
- pack 内的单文件 skill（`skills/<name>.md`）不支持。
