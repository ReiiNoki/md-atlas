# MD Atlas 前端架构

本项目仍是 React/Vite/MapLibre **纯静态网站**，浏览器读取已发布的 JSON。没有后端、SSR、运行时数据库或维护工具依赖。以下结构是渐进式整理后的实际结构，不是要求再搬迁全部文件的目录模板。

## 职责与依赖

```text
src/App.jsx                       应用组合、启用数据集、派生全局筛选结果
src/app/                          浏览状态、URL 同步、共享 UI 协调、外壳布局
src/data/                         静态请求 hooks、活动详情缓存/订阅
src/domain/                       活动类型/筛选/标准化、日历日期、统计、地理词典
src/features/map/                 地图容器/workspace、懒加载地图及地图样式
src/features/archive/             档案容器、列表/表格
src/features/calendar/            日历容器、懒加载日历、导航/网格/议程/Anomaly 系列
src/features/analytics/           数据容器、懒加载统计视图及内部面板
src/shared/ui/                    启动、加载、懒加载重试和错误边界
src/components/                   保留已有公共业务展示组件及布局组件
src/utils/                        保留 URL 编解码、活动地理标签、徽章资源路径等公共函数
src/i18n/、src/i18n.jsx            三语言文本、格式化与语言所有者
src/styles/                       保留现有样式分组与 class 名
```

- App/app 负责组合；feature 不依赖 app，也不引用其他 feature 的内部模块。
- domain 不依赖 React、网络、DOM 或 history；地理显示/搜索词典位于 `domain/geography/`。统计格式化只使用无 DOM 的 i18n 格式函数。
- shared/ui 不依赖 app、数据层或具体 feature；公共业务组件保留在 components，不能引用具体视图实现。
- data 只请求静态 JSON、标准化及缓存，不操作 URL/history。视图通过 props 接收事件选择/筛选动作。
- `utils/urlState.js` 是保留的 URL codec，由应用层使用；它不是领域状态所有者。
- 无 barrel 聚合入口。`tests-js/architecture.test.js` 检查本地导入、依赖方向、循环依赖及初始静态依赖图。

## 状态所有者与生命周期

| 状态 | 所有者 | 离开视图后的行为 |
| --- | --- | --- |
| view、filters、显式 event、写历史模式 | useExplorerState | 保留或按动作规则转换；popstate 恢复 |
| 默认展示活动 | resolveExplorerEvent 派生 | 不保存默认 ID、不写 URL |
| 主档案/搜索/补充任务/XM/统计 JSON | App 中的数据集 hooks | 成功数据跨视图保留；未完成请求禁用时取消 |
| 活动详情、每 ID 状态与错误 | 根级 EventDetailProvider 中的外部 store | 跨视图保留，不写 localStorage |
| 地图/档案共享详情开关 | useExplorerPanels | 保留；显式选择打开，离开档案专属状态时关闭 |
| 地图列表地区与开关 | MapScreen（轻量 owner） | 地区保留；显式非地图导航关闭列表；初始手机默认关闭 |
| 档案显示条数 | ArchiveScreen（轻量 owner） | 保留；筛选/重置/popstate/档案专属清理重置到 60 |
| 档案日期排序 | EventTable | 展示子树卸载后重置 |
| 日历类别、年月、日期、所选活动、滚轮锁 | CalendarView | 卸载后重置 |
| 筛选面板开关与焦点恢复 | ExplorerLayout / FilterOverlay | 显式视图导航关闭；popstate 不额外强制关闭 |
| 语言 | LanguageProvider | 原有跨视图及 localStorage 行为不变 |
| 日历/统计 chunk 重试 epoch | 对应 Screen | 轻量 owner 保留；重试重新调用 loader |

轻量 Screen 保持挂载，**不代表保留所有视图 DOM**：非活动视图返回 null，地图 workspace、档案列表、日历/数据实现仍卸载。日历导航不是为保留状态而提前加载到初始包。分页和 feed 使用版本标记接收应用层重置命令，不用 effect 先显示旧状态再更新。

## 静态数据流

- `useArchive()`：启动即请求 `data/archive.json`。
- `useSearchIndex(enabled)`：非空搜索首次启用。
- `useOfficialMissions(enabled)`：仅档案页启用，补充正文/索引并行，验证后原子发布。
- `useXmAnomalies(enabled)`：仅日历页启用，严格标准化。
- `useAnalytics(enabled)`：仅数据页启用，展开紧凑元组。
- 各 hook 返回 `{ data, status, error, retry }`，使用 BASE_URL、HTTP 状态检查、AbortController 和当前请求保护。禁用不清除成功数据；重新启用未完成/失败请求可恢复 loading。StrictMode 清理后的旧响应不能发布。

详情 store 按 ID 保留不可变 snapshot；同 ID 在途请求复用，通知只发给该 ID 的订阅者。消费者离开后仅当最后一个使用者离开才取消未完成请求；成功数据不会清除。控制器身份检查丢弃迟到结果，响应 ID 必须匹配；明确 retry 或关闭再打开失败详情都会重试，保持旧行为。Provider 的 value 始终是同一个 store，不因某活动加载而广播更新整个应用。

`MissionImage` 在没有 `picture` 时使用 `public/event-placeholder.webp`：由用户提供的老版图标（512×512 透明 PNG）等比例缩成 256×256，以无损 WebP 保存，不改颜色或图形。档案缩略图、详情和日历共用，替代可见的「暂无图片」文字；居中显示、保留 20% 留白并限制最大 144px，使用 contain，不拉伸或裁切图标。alt 明确说明是占位图，原始业务数据不变。真实图片仍沿用原 URL、加载状态和懒加载；请求失败仍显示失败提示，详情保留重试按钮，不用占位图掩盖网络错误。占位资源跟随 BASE_URL，随前端构建打包，不请求外部图片服务。

## URL 和 UI 协作

浏览 state 只保存显式请求 ID。档案页要等主/补充数据都就绪才验证；不通过加载回调恢复启动 ID，避免覆盖新选择。revision 在调度动作时更新，过期 URL effect 不写回历史。搜索 replace、离散动作 push、启动归一化/popstate replace；相同 URL 不重复写，保留 pathname/hash。存在但被筛选隐藏的显式活动仍能显示。

地图无显式活动选择时，从当前筛选结果中取最近尚未开始（UTC 日期 `date >= today`）且有有效坐标的活动作为默认高亮与定位目标；同日活动保持数据顺序，没有未来活动则取筛选结果第一项。显式选择及 history 恢复的活动优先，默认高亮不写入 URL、不自动打开详情。其他视图保留原来的默认规则：启动取主档案第一项，即使 URL 筛选隐藏它；交互筛选/重置/history 后取筛选结果第一项。`defaultScope` 表示这个来源，不把默认项当显式 event。

地图「活动动态」按当前全局筛选与 feed 地区标签派生两个区块：上方置顶最近的下一场 MD（`date >= today`），下方按开始日期倒序列出最多 2 场已结束 MD（`endDate ?? date < today`）；今天及仍在进行中的活动不列入历史。日期未知与非 MD 活动不参与，没有匹配活动时显示对应空状态。两块点击均沿用显式选择、地图定位与详情逻辑；手机保留置顶区，标题与地区标签排在同一行，历史区显示两行；缩减间距与卡片高度，但保留 44px 的历史活动点击行。短屏下仍可滚动访问历史列表。

## 验证（均为本地）

```bash
npm run check
npm run test:browser
npm run test:browser:dev
npm run test:browser:lifecycle
npm run test:workers
npm run test:browser:workers
```

- Node 测试：领域规则、URL 动作/写入、详情取消/并发/过期响应、日期计算、依赖图。
- React JSX 测试：现有 Vite 工具链在测试进程中编译实际组件，验证边界方法与渲染输出；测试-only 的 ReactDOM server renderer 不属于网站 SSR，也不进入生产包。CSS token/样式约束仍读取样式文件。
- 生产/开发/Workers Chromium smoke：四视图、三语言、桌面/移动、深链接、历史、失败重试、共享缓存、UI 状态生命周期和真实 map/archive/root 错误边界。
- lifecycle Chromium：真实 hooks + StrictMode + 人工完成的 fetch，覆盖请求启用/取消/迟到响应/失败/重试、补充档案原子发布、数据标准化及详情多消费者。fixture 只由本地测试服务器提供，不读取真实业务数据，不进入生产入口。

记录与构建体积比较见 [重构基线](FRONTEND_DECOUPLING_BASELINE.md)。不把拆文件、构建速度或 chunk 变小作为用户访问性能提升证据。

## 仍未纳入的产品调整

- 日历失败详情没有显式重试按钮；关闭再打开可恢复，是否增加按钮另行决定。
- 档案视图的启动默认展示项与筛选规则保留，地图已采用最近未来活动的默认定位。
- 保留 chunk 重试与整页刷新兜底；真实部署失效 chunk 的浏览器模块缓存限制不是目录重构解决的功能。
- 未做真实线上验收、CWV 测量或完整手工回归。地图 smoke 使用本地瓦片/字体并阻断外部图片，不代表真实网络服务质量。
- 用户已验收本地预览并授权本地提交；推送、合并或部署仍需单独授权，并先确认 Cloudflare 自动构建连接。
