<div align="center">

# dsh-wiki

**纯本地 Repo Wiki（DeepWiki 式）· 零上传、零网络、证据优先**

agent 在本地读懂仓库 → 产出带 `路径:行号` 证据的分页 wiki（目录树 + 图表）→ 构建单文件自包含站点，挂在 DSH 本机宿主上直接浏览。

`@acfufu/dsh-wiki` · 适配 DSH **0.2.0-rc.1 → 0.2.2-rc.1**（peer `^0.1.1-rc.1 || ^0.2.0-rc.1`）

</div>

---

## 为什么做这个

DSH 社区（awesome-dsh-plugin，9100+ 插件）里没有任何插件交付"DeepWiki 式仓库 wiki"：

| 现有方案 | 缺口 |
| --- | --- |
| dsh-openwiki | 包装外部 openwiki CLI（第二套工具链），2026-09 起停更 |
| dsh-code-wiki | 只有 README 摘要 + 技术栈罗列，无深度页、无引用 |
| dsh-plugin-codemap | 引用做得好，但无叙事正文、无图表、无站点 |
| archify | 只有架构图，无 wiki 文本 |

dsh-wiki = **叙事正文 + 强制机检的 `path:line` 引用 + mermaid/内联 SVG 图表 + 单文件自包含站点**，全部本地完成。

核心生成器与站点查看器移植自 [zcode-repo-wiki](https://github.com/Acfufu/zcode-repo-wiki)（MIT）——`wiki.json` 数据格式（schema `repo-wiki-local/1`）**与 ZCode 版完全兼容**，旧数据可用 `import-legacy` 一键迁移。

## 安装

前置：DSH Desktop / web profile（`dsh-base` + `dsh-web-app`），`python3 ≥ 3.7`（构建器纯标准库，无第三方依赖）。

**路线 A · GUI 插件页**：侧栏「插件」→ 添加插件 → 输入本仓库绝对路径（如 `/Users/you/Codehub/dsh plugin/dsh-wiki`）→ 安装 → 启用。

**路线 B · CLI**：

```sh
CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$CLI" plugin --profile desktop add "/path/to/dsh-wiki"
"$CLI" plugin --profile desktop list
```

装完刷新页面即可（desktop profile 是 `patchReload: live`，无需重启；版本门禁声明覆盖 0.1.5-rc 与 0.2.x-rc 两条线，无需豁免）。

## 用法

**三种入口，随你习惯：**

1. **对话里直接说**：「给这个仓库生成 wiki」「导入 ZCode 的旧 wiki」→ `dsh-wiki` 技能自动接管（运行时技能，随插件注册）。
2. **`/wiki` 命令**：

   ```
   /wiki generate            # fork 子代理按技能协议为当前工作区生成 wiki
   /wiki generate /path/repo # 指定仓库
   /wiki view                # 输出当前仓库站点的本机 URL
   /wiki list                # 列出所有已知 wiki（会话工作区 + 配置根）
   ```

3. **界面**：会话头部新增 📖 **Wiki** 按钮 → 打开本机索引页，列出全部已构建 wiki，点开即读。

**本机站点路由**（桌面宿主回环地址）：

- `/dsh-wiki/` — wiki 索引页（自动汇总已发现的仓库）
- `/dsh-wiki/site?path=<仓库>/.dsh-wiki` — 直接打开某个站点的自包含 `site/index.html`
- `/dsh-wiki/api/status` — JSON 状态

索引页发现机制：插件从会话事件自动记住工作目录并持久化（`<profile home>/dsh-wiki/registry.json`），再用 `config.wikiRoots` 补充额外根目录。

## 生成产物

`<仓库>/.dsh-wiki/`：

| 文件 | 说明 |
| --- | --- |
| `wiki.json` | 唯一事实源（schema `repo-wiki-local/1`，分页 + 内嵌 markdown） |
| `pages/<id>.md` | 每页导出副本，便于 diff |
| `generation-meta.json` | 生效配置 + 逐字段 provenance |
| `site/index.html` | **单文件自包含站点**：目录树、全文搜索、深浅主题、mermaid 离线渲染、窄屏自适应，零外链 |

站点站点是**零外链机检**过的（实体编码 / protocol-relative / CSS `url()` / `@import` 等形态都扫）；正文引用 `path:line` 由 selfcheck 强制文件存在 + 行号在界内，越界 = 生成失败。

## 配置

在 `cordis.patch.yml` 的行 `config` 里改（GUI 插件页逐行开关/改配置）：

```yaml
- id: dsh-wiki
  config:
    wikiDirName: .dsh-wiki     # 各仓库内 wiki 目录名
    wikiRoots: []              # 额外扫描的绝对路径数组
```

生成配置（语言/页数/粒度/图表/引用档位等）走构建器四层合并：内置默认 → `~/.dsh/dsh-wiki/config.json` → `<仓库>/.dsh-wiki/config.json` → `--set k=v`；预设 `compact`/`standard`/`deep`/`legacy`。

## 安全与隐私

| 行为 | dsh-wiki |
| --- | --- |
| 上传仓库内容 / Git 历史 | 从不 |
| 网络请求（生成、图表、字体、脚本） | 从不（构建器零依赖、站点零外链） |
| 读取 `.git` 对象 | 从不（唯一例外：可选 `git log --oneline -15`） |
| 站点路由暴露面 | 仅回环 Host 校验 + 目录名必须是 `wikiDirName` + 只读单文件服务 |

注意通用边界：插件宿主半区跑在宿主进程里（不受工作区沙箱限制），本插件只用 node 内建模块、不做任何写盘（除 registry.json 持久化在 profile home），建议装 `@jieai/dsh-plugin-vet` 自查。

## 测试

```sh
python3 tests/test_build_wiki_site.py   # 构建器回归 64 项（含注入 PoC、净化、配置合并、node --check 站点脚本）
node tools/harness-test.mjs             # 宿主半区 25 项：技能注册/命令/路由/信任围栏/子代理路径
```

## 许可

MIT。构建器与查看器源自 [zcode-repo-wiki](https://github.com/Acfufu/zcode-repo-wiki)（MIT，AcFufu）。内联 mermaid 运行时含第三方组件，见 `assets/THIRD-PARTY-NOTICES`。
