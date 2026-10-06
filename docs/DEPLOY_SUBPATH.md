# 在独立子域名根路径发布 MD Atlas

目标地址：**https://md-atlas.reiinoki.dpdns.org/**。不再使用 `/md-atlas/` 前缀。
文件名保留以免破坏已有文档链接；本文替代此前的主站子路径部署指南。
主站 `https://reiinoki.dpdns.org/` 不属于本应用，不能绑定或覆盖它。

## 发布结构

`site.config.js` 的 `BASE_PATH = "/"` 同时供 Vite、URL state、静态打包和回归测试使用。
`npm run build` 构建 `dist/`，再复制为 Cloudflare 静态发布包：

```text
.wrangler/assets/
  _headers
  index.html
  favicon.svg
  city-name-credits.html
  assets/
  data/
```

`wrangler.jsonc` 使用 `assets.directory: "./.wrangler/assets"`，以及
`not_found_handling: "single-page-application"`。
`/archive`、`/calendar`、`/data`、`/md/{encoded event.id}` 的直接访问和刷新由同一个 SPA shell 处理。
筛选保留在 query string；无需 React Router、Worker 后端、ASSETS 绑定或重定向。
打包清理旧发布输出，不修改 `public/data/`，不提交生成目录。

## Cloudflare 配置

只绑定本项目的独立子域名：

```json
{
  "routes": [
    { "pattern": "md-atlas.reiinoki.dpdns.org", "custom_domain": true }
  ]
}
```

部署前确认该子域名确实属于本项目、位于同一 Cloudflare 账户的已激活 zone，
并检查已有 DNS / Custom Domain，避免覆盖其他服务。
不要将父域名 `reiinoki.dpdns.org` 或通配域名绑定给本 Worker。
若控制台仍保留历史 `/md-atlas` Routes 或补斜杠规则，仅核对处理属于 MD Atlas 的旧配置，
不要修改主站或其他项目的 DNS、Worker、规则。

Workers Builds 设置：

| 设置 | 值 |
| --- | --- |
| Worker 名称 | `md-atlas` |
| 分支 | `main` |
| 仓库根目录 | 留空 |
| 构建命令 | `npm run check` |
| 部署命令 | `npx wrangler deploy --no-autoconfig` |
| 构建环境变量 | `NODE_VERSION=22` |

推送到关联分支可能触发实际部署。构建凭据需具备对应 Worker / zone / 自定义域名权限；
不要把令牌写入仓库、构建或部署命令。Custom Domain 的 DNS / TLS 生效需要线上验收，
本地测试和 deploy dry-run 不代表已部署成功。

## 验收

先验证本地 Workers preview，再检查正式域名：

- `/`：四页面、地图 Worker、语言切换和移动布局。
- `/archive?year=2026&country=JP`：页面及筛选恢复。
- `/md/md-2026-asahikawa-ee08`、Unicode ID 深链：选中事件、自动打开详情、刷新保持。
- Back / Forward：恢复页面、显式选择和详情。
- `/data/archive.json`、`/assets/*`：JSON / JS / CSS / fonts 正确 MIME 和缓存策略。
- `/city-name-credits.html`：静态页面规范化跳转及返回首页链接。
- 父域名主站及其其他应用：保持原状。

```bash
npm run check
npm run test:workers
npm run deploy:check          # dry-run，不上传
npm run test:browser
npm run test:browser:dev
npm run test:browser:workers
```

浏览器回归使用受控地图瓦片和临时浏览器，不能替代真实网络、DNS、TLS 验收。
需要回退时同步恢复 Git 与目标 Worker 的已知可用版本；不要重置整个工作区或删除主站资源。

## 官方参考

- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Static Assets SPA fallback](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Vite Public Base Path](https://vite.dev/guide/build.html#public-base-path)
