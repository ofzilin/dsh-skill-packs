# 三种 pack 模式：manifest / compat / discovery

**Status**: accepted

pack 的形态由标记文件决定，不看启用表：有 `.skill-pack/skills.json` → **manifest mode**（只暴露 `skills[]` 白名单，不递归，`name` 可覆盖 namespace）；有 `.claude-plugin/plugin.json` → **compat mode**（Claude 语义，见 ADR 0003）；只有裸 `SKILL.md` → **discovery mode**（递归 `**/SKILL.md`，namespace = 目录名）。优先级按这个顺序，前者是更刻意的声明。

## Considered Options

- **manifest 必填**：判定无歧义，但"clone 进 `dsh-skill-packs/` 就能用"就没了；而启用表已经挡掉冒名目录，manifest 的职责是"控制暴露哪些"，不是"证明这是 pack"。
- **只做 compat**：被排除，用户要的是自己的策略加上 Claude 兼容，不是只挂 Claude。
- **只做 discovery**：递归会捞到 `examples/`、`fixtures/`、`node_modules` 里的 `SKILL.md`，没有出口。
- **`skills[]` 追加而非白名单**：会让"严格模式"名不副实——列了却还扫别的，冲突时无法判断意图。

## Consequences

- 同一目录换模式会改名也改集合：删掉 `.skill-pack/skills.json` 从 manifest 掉回 discovery，namespace 从 `name` 变回目录名。
- `skills.json` 里 `skills` 缺省或为 `[]` = **不暴露任何 skill**，不回落 discovery。写空就是空。
- compat 与 manifest 同时存在 → manifest 赢，并 warn（同一目录两套声明）。
- discovery mode 需要 ignore 列表：`.git`、`node_modules`、`dist`、`build`、`.venv`、隐藏目录、符号链接。
- namespace 无论来自哪个字段，规范化后不合法 → 该 pack 拒绝加载。
