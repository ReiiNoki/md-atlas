# 中文地名显示与来源

本文代码与发布资源路径均相对于本前端仓库的根目录。

## 范围与回退

- `src/domain/geography/cityNames.zh.js` 是显示层词典，不是新的活动、坐标或地理分类数据源。
- 以 **国家或地区代码 + 原城市名** 为键；不根据拼写推断国家，不把同名城市跨国共用。
- 中文界面使用词典首个名称，英文界面保持原城市名。原名与收录的中文异译都参与搜索，切换语言不改变查询条件。
- 未收录、无法消歧、归属可疑的名称回退原文。行政区、社区、混合名称或历史名称不能只为了全中文而强行套用相邻大城市或现代名称。
- 任务标题、活动原始标题及地址不翻译；显示层词典不改写 `public/data/` 中的档案记录。
- 2026-10-08 快照覆盖 590 个不同“代码 + 城市名”中的 538 个，覆盖 785 个活动中的 730 个。这是核对时快照，不作为未来必须固定的测试数量。

## 核对方法

1. 从 [GeoNames cities500](https://download.geonames.org/export/dump/) 读取城市、代码、坐标和别名，用原名的 Unicode 规范化/去重音匹配候选；不使用模糊匹配。
2. 同一名称的所有活动都须匹配同一代码下距离 25 km 内的城市候选；先按 GeoNames ID 去重，多个候选距离相差不到 2 km 时不自动判定。位置只用于离线核对，不成为显示层业务键。
3. 从 [GeoNames 分地区 alternateNames](https://download.geonames.org/export/dump/alternatenames/) 读取 `zh`、`zh-CN`、`zh-Hans` 名称，排除被标为历史/俗称的条目。参考其直接指向的英文 Wikipedia 城市条目，而不是对裸城市名做跨国搜索。
4. 使用 MediaWiki API 的 `langlinks` 获取中文条目名，拒绝消歧页。少数精确对应的行政单位/大城市（如伦敦、香港、桃园市、利马区）单独核对对应条目，不用附近城市替换原行政单位。
5. 使用 OpenCC `t2s` 离线转换字形，并移除条目末尾的消歧括号（例如州名）；英文条目名仍完整保留在来源清单中。已有中文的源名称只转换字形，不替换行政单位。
6. 同一个显示键匹配到不同中文名称时保留原名；GeoNames 的中文别名保留用于搜索。来源存在明显行政层级问题时以对应百科条目或原始中文行政单位为准。

外部查询与转换均在维护时离线完成，页面运行不调用翻译/地理编码服务，不引入 OpenCC 等运行时依赖。

## 逐条溯源

`city-name-sources.json` 的 `columns` 描述每行字段：

- `countryCode`、`sourceCity`：发布档案中的原始键。
- `displayName`：最终中文显示名。
- `geonameIds`：可访问 `https://www.geonames.org/<id>/` 核对对应记录。
- `englishWikipediaTitles`：可访问 `https://en.wikipedia.org/wiki/<编码后的标题>`，从语言链接查看中文条目与编辑历史。
- `otherSource: "archive"`：原地名本身为中文，仅进行了繁简转换。

增加条目时提供上述来源；不要用不受代码/坐标约束的全球同名词典，也不要把未核实的新译名当作已覆盖。若未来新增活动使同一代码和城市名出现不同的行政语义，应拆分键或回退原名后再核对。

## 地图底图

OpenFreeMap 的 `place`、`water_name` 图层支持 `name:zh-Hans`、`name:zh`、`name:zh-Hant`、`name:en` 等字段，已核对其 [TileJSON](https://tiles.openfreemap.org/planet)。

- 中文优先简体中文、中文、繁体中文，缺失时回退底图原名和其他可用字段。
- 英文优先 `name:en`，再回退英文兼容字段、拉丁名、原名。
- 空字符串视为缺失，不能把标签变成空白。
- 切换语言只修改两个标签图层的 `text-field`；不重建 Map、不重置视野、不改变活动数据、边界或地理归属。加载中切换时在地图加载完成后应用最新语言。
- 标签使用独立的 `openmaptiles-labels` 矢量源，与其他底图层使用相同的可缓存瓦片 URL。更新文字不再让道路、建筑等几何层一起重新解析；代价是维护一份独立的标签瓦片缓存。
- MapLibre 6 通过浏览器本地生成字形，不配置远程 `glyphs` URL，避免首次切换英文时等待字形网络请求。Noto 字体不可用时使用系统 sans-serif 回退，字形外观可能因操作系统不同而略有差异。
- 地图的 `fadeDuration` 为 0，让新标签在完成解析后的首帧排布，避免旧语言在渐变/分帧排布阶段滞留。
- 浏览器回归检查使用双语合成瓦片，比较排除 DOM 覆盖物后的实际地图像素，并覆盖往返、快速切换和仅文字源重排。

## 署名与许可

- GeoNames 数据：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
- Wikipedia contributors：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)，条目及编辑历史可按上述来源标题访问。
- 本词典及对应来源清单按 CC BY-SA 4.0 提供，已作简体字转换、消歧后缀清理及显示层整理。此许可仅适用于词典和来源清单，不重新许可活动数据或其他代码。
- 底图保留 OpenStreetMap/OpenFreeMap 的原署名。
- 页面页脚“地名来源”链接指向 `public/city-name-credits.html`，以便静态部署后仍可查看署名。
