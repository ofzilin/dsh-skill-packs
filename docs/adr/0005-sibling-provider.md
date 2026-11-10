# 以兄弟 provider 挂进 registry，不改写也不替代 skill-filesystem

**Status**: accepted

本项目的全部代码就是一个 provider：`ctx.skills.registerProvider()` 在 `apply()` 里注册（provider 名 `skill-packs`），与 `skill-filesystem` 并排存在于同一个 registry。不把 pack 目录塞进 `skill-filesystem` 的 `customSkillDirs`，不复刻它的六个 root，也不绕开 registry 自己往上下文塞正文。

## Considered Options

- **喂 `customSkillDirs` 给 `skill-filesystem`**：唯一可挂的接口，但它只加目录、不加名字——扫描是一层 `<root>/<name>/SKILL.md`，skill 名取 frontmatter，没有 namespace 的位置；白名单、递归、compat 语义都做不到。产不出 `<namespace>-<skill>` 就等于产品没做。
- **替代 `skill-filesystem`**：要接管 6 个 root、`ctx.fs`、watch 稳定性窗口、ignore、frontmatter 容错与 `complete` 语义，还要在 profile 里关掉官方 provider。那是 fork core，每个 DSH 版本都要跟一次。
- **绕开 registry，自己挂 `agent/pre-step` 注入**：能换触发语法，代价是 `/` 菜单与模型侧 skill 目录都读 registry，两处同时消失；core 的 `/name` 手势仍会命中却查不到，静默失效。

## Consequences

- **校验必须在本项目内完成**：registry 的 `validateCandidate` 位于守卫 `provider.list()` 的 `try/catch` 之外，一个非法名字会让整个目录读取抛错，而不是丢一个 skill。ADR 0003 的"provider 先自己校验"在这里有代码证据。
- **`complete: false` 不是"重扫"逃生门**：它让 `tool-skill` 整块跳过目录发布，且永不进缓存。新 clone 的 pack 生效靠 watcher 触发 `control.invalidate()`。
- **与扁平 skill 不共享命名空间**：`grilling` 与 `mattpocock-skills-grilling` 并存，`/` 菜单会同时出现两者（共存是有意的，见 README）。
- **优先级靠 rank**：pack = 450，`~/.dsh/skills`（400）优先，`~/.agents/skills`（500）与 bundled（600）让位。
- **运行时零 `@deepseek-ai/*` 依赖**：已安装的插件解析不到宿主包（profile 的 `node_modules` 里没有 `@deepseek-ai/*`，`require.resolve` 直接失败），所以只做 `import type`，把名字文法（core 的 `SKILL_NAME`）本地抄一份——抄得比 core 严是安全的，宽松则会让整次目录读取抛错。文法一旦收窄需手动同步。
- 卸载 = 删目录或在 profile 里禁用；provider 注销后名字消失，不需要清理任何 registry。
