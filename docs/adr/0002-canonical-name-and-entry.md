# 规范名用单连字符，人类入口是 `/namespace-skill`

**Status**: accepted

registry 只接受 `^[a-z0-9]+(?:-[a-z0-9]+)*$`，core 的 `/name` 手势同文法，冒号进不了名字。规范名因此定为 `<namespace>-<skill>`，人类输入 `/namespace-skill`，由 core 原生手势注入——本项目因此不写注入代码、不做客户端渲染、不加 Remote。这是对 Claude Code `/plugin:skill` 语法的有意偏离。

## Considered Options

- 名字真带冒号：要改 `dsh-skill` 的 `SKILL_NAME`、`dsh-tool-skill` 的 `SKILL_GESTURE`、客户端 chip 正则三处 core，每次升级都可能碎。
- 名字保持 kebab，客户端把 `ns-skill` 渲染成 `ns:skill`、`/` 菜单另起一组显示冒号形：需要客户端插件 + pack→namespace 映射通道；显示层收益换跨宿主/客户端两条构建链路，且官方组不可覆盖、菜单必然重复。已随 `/ns-skill` 定案砍掉。
- 只注册不注入、由插件自己往上下文塞目录和 load 工具：等于重写 `dsh-tool-skill` 的一半，换来的唯一自由度是不受 kebab 约束，而这一点我们已经接受。

## Consequences

- 人类输入变长：`/mattpocock-skills-grilling` 不如 `/grilling` 好打，靠 `/` 菜单的模糊搜索缓解。
- 撞名两种：规范化撞名（`MattPocock_Skills` 与 `mattpocock-skills`）、拼接撞名（`a-b`+`c` 与 `a`+`b-c` 都得 `a-b-c`）。后到者拒绝加载并报诊断。
- 别名、短名、补全优化都留给未来；v1 只有一种写法。
