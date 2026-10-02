# 前端阶段 0～2 基线与边界（本地，未发布）

环境：Windows / Node 24.15.0，Chrome 可用；`frontend/` 的 `refactor/frontend-decoupling` 分支。阶段 0 修改前 `npm run check` 通过（88 项 Node 测试）。本轮在阶段 0 未运行修改前的浏览器/Workers 检查，后续检查不冒充修改前的实测结果。

## 状态归属及生命周期（修改前核对）

- App 持有当前视图、全局筛选、显式活动选择、URL history、地图活动列表地区与开关、筛选面板开关、档案显示条数及抽屉开关。视图切换后这些 App 状态仍在；切换到非地图页关闭活动列表；离开档案时清理档案专属类型/选择并关闭详情；更改筛选重置选择及显示条数。语言由根级 i18n 持有，跨视图保留。
- 主档案进入即加载；搜索索引首次有非空查询才加载；官方补充任务仅档案页加载（正文与搜索索引一起）；XM Anomaly 仅日历页加载；统计仅数据页加载。成功数据原由 App 持有，视图卸载后保留；未完成请求随视图/查询变化取消，重新启用再发起。日历组件按需导入，年月、日期、类别与所选活动随组件卸载重置；原有日历详情缓存也随之丢失。地图组件懒加载逻辑及数据视图懒加载未调整。
- URL 初始化使用查询参数，默认第一项是派生选择、不写入 URL；搜索 replace、离散动作 push，popstate 恢复视图/筛选/选择但不强制打开抽屉；补充档案加载后再验证其深链接。具体历史状态集中化留待阶段 3。

## 性能观察

修改前生产构建（Vite 输出，未压缩 / gzip）：index JS 296.48 / 96.37 kB；CalendarView 13.19 / 4.67 kB；DataView 22.11 / 6.08 kB；MissionMap 956.89 / 252.17 kB；CSS 161.70 / 23.55 kB。浏览器修改前的网络瀑布图未采集；由原请求 effect 的启用条件可知初始地图仅请求 archive.json，不能将此推断算作实测时序。

阶段 2 同环境构建：index JS 296.64 / 96.77 kB；CalendarView 12.68 / 4.44 kB；DataView 22.11 / 6.08 kB；MissionMap 956.89 / 252.16 kB；CSS 161.70 / 23.55 kB。浏览器生产预览验证初始 `/data/` 请求仅 archive.json；跨视图详情已加载后不重复请求；日历/统计 chunk 仍按需加载。体积变化不是性能提升的证据；尚未测量真实 LCP、交互耗时或渲染次数。

## 测试缺口 / 后续边界

浏览器检查曾遇一次 CDP 截图超时、一次异步搜索清理时序误判（已加强等待条件）、一次地图像素指纹不一致；再次运行完整 smoke 通过，渲染指纹仍有环境波动待独立观察。现有 Node 测试中 `url-state.test.js`、`error-boundary.test.js`、`country-filter.test.js` 等仍有源码形状断言；本轮受重构影响的一处已由浏览器深链接/历史回退覆盖替换，另一处更新为请求状态与重试连线断言。更彻底的去源码匹配留待阶段 6。当前浏览器 smoke 检查刷新深链接、历史回退、跨视图详情复用与失败重试；详情请求的并发、取消、过期响应和 ID 错配有独立单元测试。未做真实线上验收、LCP/INP/CLS 测量或完整桌面/移动端手工回归。

发现的产品行为/潜在改进（未纳入重构）：日历原详情失败时未提供重试入口；本轮仍保留这个 UI 行为，后续是否提供重试须单独确认（缓存接口已支持）。数据视图选择活动后进入档案页，若该活动详情不属于主档案且补充档案尚未就绪，原 URL 同步时序仍需要阶段 3 单独审查，不在此轮改写规则。

## 阶段 3：集中浏览状态与 URL 同步

新增 `src/app/explorerState.js`（浏览状态转换、选择解析、URL 写入）与 `src/app/useExplorerState.js`（初始化、popstate、transition 和 URL 同步）。App 仅调用动作、传入数据就绪情况和维护原有 UI 状态；数据层及视图组件不操作 history。状态 hook 先提供 view 以启用数据集，同模块的 `useExplorerUrlSync` 随后接收结果进行验证，避免数据层与浏览状态层循环依赖。

- 显式 ID 留在浏览状态，默认展示项只派生，不写入 URL。保留一个容易忽略的旧行为：启动时无有效显式选择，会默认主档案第一项，即使 URL 筛选隐藏它；用户筛选、重置或 history 恢复后则默认筛选结果第一项。用 `defaultScope` 标识来源，未混入默认展示规则的产品调整。
- 主档案和补充档案都就绪后才归一化档案链接；失败/未就绪不提前移除补充活动 ID。删除两个按启动 URL 重设选择的加载后 effect，避免任意完成顺序覆盖较新的用户选择。
- 浏览动作原子更新 view/filters/event/writeMode；递增 revision 在调度时即生效，过期 effect 不写回历史；数据验证不覆盖更新的动作。URL 已相同不重复写入，搜索 replace、离散动作 push、归一化和 popstate replace；保留 pathname/hash。popstate 不强制开关详情抽屉，仅恢复浏览状态及原有分页重置。
- 离开档案时仍清理档案专属类型或已知补充活动选择；其他筛选保留，UI 关闭/重置由 App 执行。数据视图跳档案的选择与视图更新合并为一个动作。核对真实来源后确认：当前统计只接受主档案事件，上一节关于数据视图选中补充任务的描述只是待验证假设，不是现有可复现路径。

### 阶段 3 验证记录

`npm run check`：lint、97 项 Node 测试及生产构建通过。`npm run test:browser`：Chrome 生产预览通过，新增检查包括：主档案/补充档案两种请求完成顺序、pending URL 保留、新选择不被启动链接覆盖、搜索 replace、国家筛选 push/前进/后退、档案专属筛选及隐藏选择恢复、抽屉不自动打开。保留原有四视图/三语言/移动端/错误重试/共享详情缓存与初始数据请求检查。受影响的 URL 和国家选择源码断言改成实际状态转换、写入行为及浏览器验证。

`npm run test:workers`：本地静态 HTTP 检查通过，不是线上部署验收。未执行线上检查、真实 Web Vitals 或完整手工回归。此前阶段 2 的截图/地图像素波动记录仍适用，本阶段完整浏览器运行均通过（包含最后一次在最新生产构建上直接运行检查脚本）。

同环境生产构建：index JS 297.89 / gzip 97.21 kB（阶段 2 为 296.64 / 96.77 kB，约增加 1.25 / 0.44 kB）；CalendarView 12.68 / 4.44 kB，DataView 22.11 / 6.08 kB，MissionMap 956.89 / 252.17 kB，CSS 161.70 / 23.55 kB。未新增初始数据请求，懒加载保持；没有声称性能改善。选择验证使用 memo，避免 UI-only 更新重复扫描事件源。

阶段 3 完成时暂停，随后用户授权继续阶段 4～6。所有修改留在本地重构分支，未提交、推送、部署、更新 public/data 或运行维护工具。

## 阶段 4～6：视图容器、有限迁移及完整回归

- 建立 MapScreen、ArchiveScreen、CalendarScreen、AnalyticsScreen 和 ExplorerLayout。地图列表地区/开关、档案条数分别归轻量稳定 Screen；跨视图共享抽屉及 UI 重置命令归 useExplorerPanels；日历导航/网格/议程拆开，但年月与活动选择仍随 CalendarView 卸载重置。详情订阅下放档案和日历议程，单条详情变化不再使 App 订阅缓存重新渲染。
- 仅迁移职责明确的视图/内部面板、通用恢复 UI、纯领域规则与地理词典；公共业务组件和样式分组保留原位。地图样式归地图 feature，统计计算归 domain，无 barrel 或全目录搬迁。依赖图测试验证路径可解析、无循环、依赖方向及懒加载实现不进入初始静态依赖图。
- 移除替代的 App 请求/缓存/URL/UI 展示逻辑。URL/国家筛选、错误边界、页脚和档案表格的脆弱 React 源码断言已改为状态行为、实际 JSX 渲染或浏览器验证；保留有意义的静态 CSS/token 约束。测试复用现有 Vite/React，不新增依赖。
- 收尾恢复两个生命周期细节：失败的数据集重新启用时清除旧错误并进入 loading；失败详情关闭再打开重新请求（不把错误永久缓存）。后者通过原实现 effect 的依赖变化确认是已有行为，不新增 UI 按钮。
- 更新架构文档 `docs/FRONTEND_ARCHITECTURE.md` 与 README 链接。测试-only JSX 编译/渲染及本地 lifecycle fixture 均不进入网站生产入口，不是新增网站后端或 SSR。

### 执行结果与限制

- `npm run check`：lint 无警告/错误，103 项 Node 测试及生产构建通过。
- `npm run test:browser`：生产预览 Chromium smoke 通过；包括四视图、三语言、桌面/移动、深链接两种数据完成顺序、前进后退、搜索 replace、筛选 push、详情缓存/重试、分页/feed/日历生命周期及真实错误边界隔离。
- `npm run test:browser:lifecycle`：真实 hooks + StrictMode + 可控 fetch 检查通过，覆盖全部数据集与详情取消、迟到响应、并发、失败、重新启用/关闭再打开、重试、原子发布和标准化。fixture 不读 public/data，不访问维护工具。
- `npm run test:browser:dev`、`npm run test:workers`、`npm run test:browser:workers`：均通过。开发模式首次检查发现统计脚本把 src/data JS 模块当 JSON 请求，并忽略 StrictMode 的取消重放；已按发布数据路径区分，生产仍严格只有一个 archive.json 初始请求，开发只允许 1～2 次主档案尝试，无其他初始 JSON。
- JSX 行为测试曾遇 Windows c:/ 与 C:/ 导致的 Vite SSR 测试上下文重复，测试 helper 已规范驱动器拼写；浏览器 fixture 首次地址重复 base 也已修正。这些是测试环境/脚本问题，不是改动网站 URL 规则。
- Workers 检查仅本地 static-assets 运行时，非生产 Cloudflare 更新。未执行线上部署/验收、真实数据更新、CWV/LCP/交互耗时测量或完整手工回归。此前地图像素/截图环境波动仍需注意，不能把重跑通过当作对所有失败的解释。

### 生产输出对比

| chunk | 阶段 0 原始 kB / gzip | 完成后 kB / gzip |
| --- | --- | --- |
| index JS | 296.48 / 96.37 | 300.44 / 98.11 |
| CalendarView | 13.19 / 4.67 | 13.52 / 4.76 |
| DataView | 22.11 / 6.08 | 22.11 / 6.08 |
| MissionMap | 956.89 / 252.17 | 956.89 / 252.17 |
| CSS | 161.70 / 23.55 | 161.70 / 23.55 |

入口约增加 3.96 kB（1.34%），gzip 约增加 1.74 kB；没有声称变快。初始地图只加载主档案 JSON，已加载详情跨视图不重复请求，日历/统计/地图仍懒加载。静态发布文件数仍为 895，维护数据、测试 fixture 未进入生产发布包。原有地图 chunk >500 kB 提示保留，不机械拆包。

未纳入的产品项继续单独保留：日历显式重试入口、启动默认展示规则、真实部署失效 chunk 的模块缓存行为。本地提交已获授权；推送、合并和发布仍需要另行授权。

最终验收证据（Windows 临时目录，未提交）：生产浏览器 `md-atlas-browser-ZImJxD`、开发浏览器 `md-atlas-browser-bjYTRl`、Workers 浏览器 `md-atlas-browser-gnwwBr`、Workers HTTP `md-atlas-workers-http-otXw0L`、生命周期检查 `md-atlas-lifecycle-GHCRRi`。这些位于 `%TEMP%`，可能被系统清理。`git diff --exit-code HEAD -- public/data/ src/styles/ package-lock.json` 通过；地名字典迁移前后 Git blob ID 都是 `3385ea463a1414f9c0423c5f69561d14a0fdd48e`，内容未改。

用户已确认本地生产预览体验无问题，并授权在 `refactor/frontend-decoupling` 创建本地提交。提交前再次执行 `npm run check`，lint、103 项测试及构建通过；业务数据、样式、锁文件及部署配置均未变更。未执行推送、合并或部署。前文的“未提交”描述保留为各阶段完成时的历史状态。
