# Skill Packs

把一个仓库整体挂进 DSH，让仓库里的 skill 以 `<namespace>-<skill>` 进入 registry，人类用 `/namespace-skill` 调用。术语围绕"一个 pack 以什么形态被识别、命名、启用"。

## Language

**skill pack (pack)**:
`~/.dsh/dsh-skill-packs/` 下的一个目录，其形态由目录里的标记文件决定（见三个 mode）。
_Avoid_: plugin（DSH 里指 Cordis 插件）, bundle, 技能包

**pack root**:
存放 pack 的目录。v1 只有用户级 `~/.dsh/dsh-skill-packs/`。
_Avoid_: skills 目录, 插件目录

**pack mode**:
pack 的解释方式，由标记文件决定：manifest / compat / discovery。同一个目录换标记就换 mode。
_Avoid_: 类型, kind, 格式

**manifest mode**:
有 `.skill-pack/skills.json` 的模式。只暴露 `skills[]` 列的 skill，不递归。
_Avoid_: native pack, 严格模式（口头可以，文档不用）

**compat mode**:
有 `.claude-plugin/plugin.json` 的模式，按 Claude Code 插件语义解释。
_Avoid_: claude pack, 兼容模式（口头可以，文档不用）

**discovery mode**:
既无 manifest 也无 plugin.json、但有 `SKILL.md` 的模式，递归发现。
_Avoid_: 自发现模式, 裸模式

**pack manifest (`.skill-pack/skills.json`)**:
manifest mode 的声明文件：`{name?, description?, skills[]}`。`skills[]` 是白名单，不是追加。
_Avoid_: 配置文件, pack.json

**namespace**:
规范名的前缀。manifest mode 取 `name`（缺省目录名），compat mode 取 `plugin.json` 的 `name`，discovery mode 取目录名。
_Avoid_: 前缀, 分组, 仓库名

**canonical name (规范名)**:
`<namespace>-<skill>`，单连字符，是该 skill 在 registry 里的唯一身份。
_Avoid_: 全名, 限定名

**flat skill**:
直接放在标准 skill 根（`<project>/.dsh/skills`、`~/.dsh/skills` 等）下的 skill，名字就是 frontmatter 的 `name`，不带 namespace。
_Avoid_: 官方 skill, 普通 skill, 全局 skill

**enable table (启用表)**:
`settings.json` 里"目录名 → 布尔"的表，决定一个 pack 是否被加载。键是目录名，与 namespace 无关。
_Avoid_: 配置, registry, 清单

**provider**:
向 skill registry 提供候选者的实现。本项目全部代码就是一个 provider。
_Avoid_: 插件, 加载器, 扫描器

**registry**:
DSH 内核的 skill 目录。模型目录、`skill` 工具、core 的 `/name` 注入都从它读。
_Avoid_: 索引, catalog, 数据库

**register (注册)**:
provider 把候选交给 registry 的动作；插件被卸载即撤销。只决定"名字可不可见"，不产生注入。
_Avoid_: 挂载, 加载, 注入（注册与注入是两件事）

**injection (注入)**:
`agent/pre-step` 把 skill 正文作为一条 `<skill_content>` 用户消息追加进本轮对话。由 core 完成，本项目不实现。
_Avoid_: 加载, 激活, 执行

**invocation (调用)**:
人类在输入框打 `/canonical-name`。core 的手势正则命中后触发 injection。
_Avoid_: 触发, 使用, 运行
