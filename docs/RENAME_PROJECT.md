# 统一项目拼写为 MD Atlas

项目标识使用 **`md-atlas`**，不要再使用历史误拼 `md-altas`。
此指南用于从已上线的旧名称安全迁移；修改本地文件并不等于 GitHub、Cloudflare 或本机目录已改名。

## 名称对应表

| 项目 | 正确值 |
| --- | --- |
| 页面显示名 | `MD Atlas`（原本已正确） |
| npm 包名 | `md-atlas`（原本已正确） |
| GitHub 仓库 | `ReiiNoki/md-atlas` |
| Cloudflare Worker / 构建连接 | `md-atlas` |
| 正式入口 | `https://md-atlas.reiinoki.dpdns.org/` |
| 静态包中的应用目录 | `.wrangler/assets/` |

旧拼写仅用于迁移说明、回归测试反例及真实历史记录；不要重写既有提交、备份或原始业务数据。

## 安全切换顺序

### 1. 保留旧站点，暂停旧 Worker 的自动构建

先记录原主站、旧 Worker 的 Routes / Custom Domains 和 Redirect Rules。
暂停或断开旧 `md-altas` Worker 的 Git 自动构建连接，但**不要删除其已部署版本、路由或 DNS**。
新 Worker 和 `md-atlas.reiinoki.dpdns.org` 不得覆盖同名的其他项目；先核对目标名称和域名是否可用。

仅改 `wrangler.jsonc.name` 不能完成云端改名。项目固定的 Wrangler 4.131.1 在检测到
`WRANGLER_CI_OVERRIDE_NAME` 与配置不同时，会警告并使用构建系统指定的名称；连接式构建还可能提出改回名称的 PR。
因此不要用旧 Worker 的构建连接直接发布此次改名，也不要绕过构建系统的名称约束。

### 2. 在 GitHub 重命名现有仓库

在当前仓库的 **Settings → General → Repository name** 将名称改为 `md-atlas`。
这是重命名现有仓库，不是另建空库后覆盖推送；保留原历史、许可证及 `main`。
若新名称已被使用，先核对归属，不能覆盖另一个仓库。

确认重命名成功且新地址仍是原仓库后，再从本地工作区执行：

```bash
git -C frontend remote set-url origin https://github.com/ReiiNoki/md-atlas.git
git -C frontend remote -v
git -C frontend ls-remote --refs origin refs/heads/main
```

核对远端提交仍属于原来的 `main`，再按批准的范围提交推送本次改动。
不强推、不推送旧 `master` 或父仓库归档。不要为了改名重新申请或公开令牌。

### 3. 在正确的 Worker 中发布改名后的提交

旧构建已暂停后，先把通过检查的改名提交推送到新仓库。
然后在同一 Cloudflare 账户创建 **`md-atlas` Worker**，连接 `ReiiNoki/md-atlas` 的 `main`，
确保首次构建使用的提交已包含正确名称，不要让新 Worker 部署旧配置并接管旧地址。

这是保留旧服务的并行迁移方式，不假定控制台支持原地重命名 Worker。
若 `md-atlas` Worker 已存在，先核对它确实属于本项目，不能直接覆盖。

- 根目录留空，使用 GitHub 仓库根目录，不填 `frontend`。
- 构建命令：`npm run check`。
- 部署命令：`npx wrangler deploy --no-autoconfig`。
- 构建环境：`NODE_VERSION=22`。
- 构建凭据需要正确的 zone 读取及 Workers Routes 编辑权限。
- 核对 GitHub 应用仍授权正确的重命名后仓库；不要把 PAT 写入构建命令。

新配置只管理独立子域名的 Custom Domain：`md-atlas.reiinoki.dpdns.org`。

不要把主站 `reiinoki.dpdns.org` 绑定给 MD Atlas，也不要修改主站 DNS 目标。
本地构建和 dry-run 不证明云端名称、授权或路由已同步。

### 4. 同步入口重定向，验收后再处理旧入口

按[部署指南](DEPLOY_SUBPATH.md)发布到独立子域名根路径，不需要 `/md-atlas` 补斜杠规则。

先验证新 Worker 默认域名的 `/`，再验证正式域名的新入口、JSON、地图 Worker、署名页和原主站。
不要仅凭 GitHub CI 通过认定 Cloudflare 发布成功。

旧 Worker 不会因为本地名称改变而自动退役。本指南默认先保留旧服务，避免已有链接立即失效。
如果还需要把旧书签导向新入口，应另行配置仅覆盖旧路径段的重定向，保留剩余路径和查询参数，
不能将所有旧 JSON / JS 请求一律跳到 HTML 首页，也不能匹配 `/md-altas-other` 等无关路径。
旧入口的兼容重定向不在本次 `wrangler.jsonc` 中自动创建。

只有在新入口和需要保留的旧链接均验收后，才移除只属于旧项目的两条旧路由、旧补斜杠规则和旧 Worker。
**不要删除原主站 Worker、主站 DNS 或其他项目的规则。**
若迁移失败，保留旧部署服务旧入口，撤销本次新增的路由/规则并同步修正 Git 配置；不要重置整个工作区。

## 本机目录名

当前工作区目录如果仍叫 `md-altas`，它不会进入 Vite URL，也不会改变 GitHub 仓库名。
可以在迁移完成后关闭本项目的终端、开发服务、编辑器与代理会话，再在文件管理器中将外层目录改为 `md-atlas`，
重新打开工作区。不要在正在使用该目录的会话中强行移动它，也不要停止其他项目的服务。

`frontend/`、`data-tools/`、本地 `docs/` 继续作为兄弟目录；活动 `.git` 始终在 `frontend/` 中。
相对路径不变，不需要移动前端到工作区根目录，不需要重新初始化 Git 或重新生成业务数据。
历史记录中的实际旧目录路径保留，不作为新的运行配置。

## 参考

- [GitHub：重命名仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [Cloudflare Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [独立子域名根路径部署](DEPLOY_SUBPATH.md)
