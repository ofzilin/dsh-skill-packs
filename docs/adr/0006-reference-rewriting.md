# 包内引用：只按语法重定向，不内联

**Status**: accepted

pack 里的 skill 正文会用裸名引用同包的其它 skill（`grill-with-docs` 写的是
`Call the Skill tool twice, for "grilling" and "domain-modeling"`）。一旦 pack 被命名空间化，
`grilling` 就不再是一个 registry 名字。插件不能判断一个词是技能引用还是普通名词，所以只对
**语法上不可能是散文**的两种形态改写，并给剩下的裸名补一条命名空间规则：

- `` `/name` `` —— 就是调用手势本身（core 的手势文法）；
- 同一行出现 `skill` 时的 `"name"` —— 工具调用的写法。

改写后的裸名如果还有残留（散文里的用法），在正文前加一段 `Pack namespace` 规则，交给模型做语义判断。

## Considered Options

- **对同包名字做无差别替换**：在 `mattpocock/skills` 上会改坏 `wayfinder` 的标签取值
  （`` `research`, `prototype`, `grilling`, `task` ``）以及散文（`Before any grilling`）。
- **内联被引用的正文**：`ask-matt` 一个文件引用 25 个同包 skill，其中 16 个是
  `disable-model-invocation`；内联会把这些正文全部塞进一次调用，并且绕过了作者
  "这个由人类触发"的意图。
- **注册短名别名**：registry 名字是全局的，跨包同名要仲裁，且目录会翻倍——ADR 0002 已推迟。
- **只加规则句、不改写**：可行但每次加载都要模型做一次映射；调用手势（`/triage`）改写后
  人类复制粘贴就能直接用。

## Consequences

- 改写依赖语法，不依赖语义：写成 `Use grilling to…`（无引号无斜杠）的引用不会被改写，
  只由规则句兜底；这是可接受的残留。
- 规则句只在**改写后仍有裸名**时出现，所以引用都被改写掉的正文一个 token 都不多付。
- 每个 pack 可以用 `config.json` 的 `packs.<dir>.mode` 单独降级（`note` / `off`），
  给写法不规范的仓库留后门。
- 引号形态只改写 `modelInvocable` 的目标：对仅人类可见的 skill 改写名字会诱导模型调用一个
  必然失败的 skill。
