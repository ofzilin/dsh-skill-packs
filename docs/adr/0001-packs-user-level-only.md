# pack 只放用户级，项目级只放启用表

**Status**: accepted

Claude Code 有三层（marketplace 索引 / 版本目录 `cache/<marketplace>/<plugin>/<version>/` / installed registry + scope），我们全部不复刻：git 内容只放在 `~/.dsh/skill-packs/<dir>/`，项目级只放 `<project>/.dsh/skill-packs/settings.json` 声明"这个项目启用哪些 pack"，不存任何文件。这样磁盘就是唯一事实，不会出现 registry 与磁盘不一致；代价是没有版本 pin/回滚、更新直接作用于正在运行的会话、禁用只能关开关或移走目录。

## Considered Options

- 复刻三层：换来 pin、回滚、原子更新，代价是要维护 marketplace 索引、版本目录和 installed registry，还得自己实现 Claude 那页"装了但没装好"的诊断。
- 项目级也放 clone：pack 成为嵌套 git 仓，主仓 `git status` 拒收其内容，必须 gitignore，且同一 pack 在不同机器上的路径不同。
- 只放一处配置、不分层：简单，但项目无法单独关掉一个有冲突的 pack。

## Consequences

- 项目协作靠提交 `settings.json`；协作者仍需各自在用户级 clone 一次。
- `settings.json` 的键是**目录名**，不是 namespace——重命名目录会让旧键悬空（warn，不阻塞）。
- 用户级 `skill-packs/` 与 pack 同级放着 `settings.json`，扫描时必须跳过所有非目录条目。
- 项目级 `skill-packs/` 只读 `settings.json`；里面若出现子目录（有人以为能放 pack），忽略并 warn。
