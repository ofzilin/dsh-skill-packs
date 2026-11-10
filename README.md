# dsh-skill-packs

把仓库整体挂进 DSH 的 Cordis 插件。一个仓库 = 一个 namespace，其中的 skill 以 `<namespace>-<skill>` 进入 skill registry，人类用 `/namespace-skill` 调用。

DSH 自己有一套 pack 策略（manifest mode），同时兼容 Claude Code 插件仓（compat mode），尚未成型的仓库用 discovery mode 直接挂。

**状态**：v1 已实现（三种 mode + 启用表 + watcher），`npm test` 全绿；验收样本是 `mattpocock/skills` 的 27 个名字。

## 要解决的问题

DSH 的 skill 发现只扫一层（`<root>/<name>/SKILL.md`），所有仓库的 skill 只能摊平进 `~/.dsh/skills` 或 `<project>/.agents/skills`，来源信息在落盘那一刻就丢了。摊平的 mattpocock skills，就是这个状态的样本。

目标：仓库整体挂载，名字自带来源，删目录即卸载。

## 三种 pack 模式

模式由目录里的标记文件决定，与启用表无关；优先级从上到下。

| | 标记 | skill 来源 | namespace |
|---|---|---|---|
| **manifest** | `.skill-pack/skills.json` | 只 `skills[]` 列的目录，不递归 | `name` ?? 目录名 |
| **compat** | `.claude-plugin/plugin.json` | `skills[]` ∪ `skills/*/SKILL.md` | manifest `name` |
| **discovery** | 裸 `SKILL.md` | 递归 `**/SKILL.md` | 目录名 |

两类标记同时存在 → manifest 赢，并 warn。

### manifest mode

```json
{
  "name": "mattpocock-skills",
  "description": "…",
  "skills": ["./skills/engineering/grilling", "./skills/productivity/grilling"]
}
```

- `skills[]` 是**白名单**，不是追加。
- 每条路径必须是"含 `SKILL.md` 的目录"，相对、以 `./` 开头、不得逃出 pack 根。
- 缺省或 `[]` = 不暴露任何 skill，**不回落** discovery。
- 不支持 glob。
- 适合：想控制暴露哪些、或仓库布局任意。

### compat mode

按 Claude Code 插件语义解释（ADR 0003）：`skills[]` 追加到 `skills/` 默认扫描；根有 `SKILL.md` 且无 `skills/`、无 `skills` 键 → 整包当一个 skill，规范名就是 namespace（不再拼一层 skill 名）；只有 `marketplace.json` 的仓不展开，出诊断。

### discovery mode

递归找 `**/SKILL.md`，skill 名取 frontmatter。ignore：`.git`、`node_modules`、`dist`、`build`、`.venv`、隐藏目录、符号链接。

适合：还没想好要不要写 manifest 的仓库——drop 进去就能用，之后想收紧再加 `skills.json`。

## 布局

```
~/.dsh/dsh-skill-packs/
  settings.json                    # 启用表
  mattpocock-skills/               # git clone，原样放，不改造
    .claude-plugin/plugin.json
    skills/engineering/grilling/SKILL.md

  my-team-skills/                  # 我们自己的策略
    .skill-pack/skills.json
    skills/release/SKILL.md

  scratch-notes/                   # 没标记，discovery mode
    anything/deep/SKILL.md

<project>/.dsh/dsh-skill-packs/
  settings.json                    # 只放启用表，可提交
```

项目级不存文件，只声明意图（ADR 0001）。协作者各自在用户级 clone 一次。

本仓库叫 `dsh-skill-packs`（插件源码），运行时目录是 `~/.dsh/dsh-skill-packs/`（存放 pack）—— 同一个名字，靠路径区分。

## 启用表

```json
{ "mattpocock-skills": true }
```

- 键是**目录名**，与 namespace 无关（ADR 0001）。
- 无条目 = 不启用；`true` = 启用；`false` = 禁用，并遮蔽用户级同名目录。
- 键指向的目录不存在 → warn，不阻塞启动。

## 命名

| | |
|---|---|
| canonical name | `<namespace>-<skill>`，单连字符 |
| 人类入口 | `/canonical-name` |

- namespace 来源随模式变化（见上表），规范化后必须合法，否则该 pack 拒绝加载。
- 规范化：小写，`_`/`.`/空格 → `-`，连续 `-` 合并，去首尾 `-`。
- skill 名一律取 frontmatter `name`；缺失或非法 → 丢该 skill 并 warn。
- 撞名（规范化撞名或拼接撞名，如 `a-b`+`c` 与 `a`+`b-c`）→ 后到者拒绝加载并报诊断（ADR 0002）。

## 调用链

`/mattpocock-skills-grilling` → core 手势正则命中 → `ctx.skills.get()` → `isUserInvocable` 检查 → `agent/pre-step` 注入 `<skill_content>` → 客户端 chip。

全程 core 完成，本插件的 provider（`skill-packs`）只负责把名字放进 registry（ADR 0005）。

## 生效与优先级

- **生效**：监听 `~/.dsh/dsh-skill-packs/`，目录变化触发 registry 缓存失效，下一次 pre-step 即生效，不需要重启会话。
- **优先级**：provider rank 定为 **450**。撞名时 rank 小者胜，因此 `~/.dsh/skills`（400）里的扁平 skill 赢过 pack，而 `~/.agents/skills`（500）与 bundled（600）让位给 pack。
- **`.git` 保留**：pack 目录里带着上游仓库的 `.git`，更新就是在原地 `git pull`；扫描忽略它。
- **递归不设深度上限**：v1 不设，跑出问题再加。

## 非目标（v1）

- 项目级 pack、安装/更新/卸载、版本 pin、marketplace 索引
- `commands/`、`agents/`、`hooks/`、`.mcp.json`、`output-styles/` —— 全部忽略
- 客户端插件、`/ns:skill` 冒号形、`/` 菜单分组、chip 定制
- pack 内的单文件 skill（`skills/<name>.md`）、manifest 里的 glob

## 安装

本地开发期直接把本仓库挂进 profile（需要绝对路径，且先 `npm run build` 产出 `lib/`）：

```sh
dsh plugin --profile web add C:\WorkSpace\ofzilin.github\01-plugin-dev\dsh-skills-plugin
```

发布到 GitHub 之后改成 `dsh plugin --profile web add github:ofzilin/dsh-skill-packs#v0.1.0`。

## 开发

```sh
npm install
npm test          # vitest，直接 import src/，不需要先 build
npm run typecheck
npm run build     # tsdown → lib/index.js，tsc → lib/types/
```

约定：**运行时不 import 任何 `@deepseek-ai/*`**（已安装插件解析不到宿主包，见 ADR 0005），`@deepseek-ai/*` 只进 `devDependencies`；运行时依赖只有 `yaml` 与 `chokidar`。名字文法在 `src/names.ts` 本地留一份，`tests/names.spec.ts` 对着 core 的 `isSkillName` 逐条比对。

## 文档

- [GLOSSARY.md](./GLOSSARY.md)
- [ADR 0001：pack 只放用户级](./docs/adr/0001-packs-user-level-only.md)
- [ADR 0002：规范名与人类入口](./docs/adr/0002-canonical-name-and-entry.md)
- [ADR 0003：compat mode 的识别与发现](./docs/adr/0003-pack-discovery-and-provider.md)
- [ADR 0004：三种 pack 模式](./docs/adr/0004-pack-modes.md)
- [ADR 0005：兄弟 provider](./docs/adr/0005-sibling-provider.md)
