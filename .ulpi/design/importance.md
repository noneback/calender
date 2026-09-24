# 重点事件与单页终端改版

Every screen must read as the same product if placed side by side.

绑定 DESIGN.md。设计改动针对“每天先看什么”的问题：强制让重点事件在折叠前可见，移除个人管理与分类导航，不能仅换颜色。

## 组件与交互

1. 页头为品牌＋“市场日历”，右侧数据来源与分级依据。移除宣传标题、sidebar、categories、add-event、favorites、personal form/delete/export/leader management。已有 localStorage 不清空；只保留时区设置读取保存，个人事件不加入只读公共日历。
2. 用户进一步明确“主体只是日历组件”。因此不显示近期重点带、概览卡或常驻详情侧栏。工具栏增加小型“下个重点”按钮（id next-important），使用 nextHighlights 的第一个事件；点击跳转并打开当天侧向dialog，清除隐藏该事件的筛选，若无未来high则禁用并解释。默认页面就是一块占满宽度的大月历。
3. 日历工具：上/下月、当前年月、原生month跳转、今天；时区；仅重点开关 `#important-only`（aria-pressed）；月历/日程；搜索可保留紧凑字段。删除事件类别按钮。
4. 月历：每格按 importance 降序展示最多3条，同级保持原日期时间顺序；重点以琥珀标识“重点”+边线表示，非仅颜色；aria-label含重点数量。短标题不能将FOMC首日和末日都缩成同一个FOMC，使用完整紧凑短名或允许title查看。已过日期自然次要，不降低文字可读性。
5. 每日详情：点击日期后用原生dialog侧向面板打开（id day-dialog），提供关闭按钮；Escape返回焦点。不要常驻aside。日程视图直接内联事件详情。按重要性优先列出。每条 event-card 显示3档徽标、类别普通文本、时间、标题、`为什么关注` 的规则理由、原始日程说明可用 details 渐进展开，来源链接。移除个人关注/编辑/删除。顶部标出重点数量。日程列表复用相同事件展示。
6. 分级依据：复用原生 info-dialog。明确规则来自本站，不是数据提供者官方星级；季度三巫日／四巫日、CPI、非农、PCE、FOMC末日、BOJ决议日为重点；财报仅IVV当期整体前十代表公司重点，其他财报值得留意。会议首日、经济常规发布与交易假期值得留意。个人事件常规但页面不再显示。规则解释集中在 importance.ts 导出的文本，不能与UI硬编码产生分歧。

## 状态与边界

载入沿用现有状态；数据源失败/超时保留来源状态与具体报错，不能误标成功。无匹配事件提示清除筛选。只有medium的日期在only-high下为空，要提示“没有匹配的重点事件”而不是“今天没有事件”。新分级无需迁移 feed/saved JSON。刷新回当前月，只读无表单草稿，时区依旧持久化；无账号/会话过期。保持浏览器本来的前后导航，不引入路由。

键盘路径用真实按钮与select、dialog，焦点环2px accent；Escape关闭dialog；aria-live用于事件详情。筛选重绘后恢复焦点，尤其重要开关。低动态偏好关闭过渡。长标题截断不得遮挡重点徽标，详情显示完整；手机日历横向滚动范围只限网格，不能把页面撑宽。

## 工程边界与 API

根任务负责 `src/importance.ts` 与测试，工程 agent 负责 main.ts / view.ts / style.css 和 Bootstrap安装配置。避免同时改同一文件。

根任务提供：
- `ImportanceLevel = 'high' | 'medium' | 'normal'`
- `Importance = { level: ImportanceLevel; label: string; reason: string }`
- `RankedEvent = MarketEvent & { importance: Importance }`
- `rankEvents(events: readonly MarketEvent[], leaders: readonly Leader[]): RankedEvent[]` （保留输入顺序）
- `byImportance(events: readonly RankedEvent[]): RankedEvent[]` （稳定排序重点优先）
- `nextHighlights(events: readonly RankedEvent[], zone: Zone, now: Date): RankedEvent[]` （未来最近3条high，源时区处理全天，调用时传已按时间排好的events）
- `importanceGuide: readonly { label: string; description: string }[]`
- `importanceNotice: string`

ViewState 新增 `importantOnly: boolean`，保留 category/favoritesOnly 字段兼容现有模型测试，但 UI 不展示/操控分类和关注（固定all/false）。filteredEvents 输入/输出改为RankedEvent[]并增加importantOnly条件。allEvents()采用 rankEvents(sortEvents(feed.events,saved.zone),feed.leaders)。所有新函数显式传参，不写默认参数。

## Pre-flight 与交付

设计预检：单一technical方向，单页组件仅工具条/网格两个布局，点击后才显示详情，此处按用户简化要求不添加多余区块；只有重要性语义色为焦点。色盲用户通过文字徽标识别；无宣传hero、三等宽卡、装饰灯或虚假指标。保留原生平台控件并实际导入Bootstrap，避免手写仿库。所有空/失败/筛选状态有说明。无深浅两套主题，本次仅用户要求的深色。

Target: 当前项目 TypeScript/Vite UI engineering agent；保持现有原生TS，不因使用库重写框架。
“Implement exactly this spec. Theme the design system with our locked tokens; do NOT redesign or re-implement its components.”

验收：Bootstrap在依赖及构建产物中；页面没有侧栏/分类/添加事件；high标记在月历、日程及每日详情一致；only-high与搜索组合正确；月历溢出槽重点优先；只有medium时不伪造high；来源及预估财报字样保留；桌面1440和手机390截图无整页溢出；npm test/build通过。

## 验证用色值
文字对比度（WCAG sRGB 计算）：
- text / surface: 13.61:1
- muted / surface: 7.41:1
- accent / surface: 7.47:1
- high / high-bg: 8.54:1
- medium / medium-bg: 6.90:1
- danger / surface: 8.79:1

所有正文组合超过 4.5:1。网格边线不承担文字或唯一状态识别，重点状态同时有文字；焦点使用 accent。

OKLCH 参考（L 0–1）：
- background: oklch(0.2039 0.0169 241.04)
- surface: oklch(0.2495 0.0217 240.29)
- elevated: oklch(0.2995 0.0279 236.37)
- text: oklch(0.9444 0.0080 216.63)
- muted: oklch(0.7573 0.0195 227.37)
- accent: oklch(0.7544 0.0645 210.03)
- border: oklch(0.3941 0.0283 232.73)
- high: oklch(0.8498 0.1077 81.93)
- high-bg: oklch(0.3010 0.0229 80.99)
- medium: oklch(0.8090 0.0496 225.11)
- medium-bg: oklch(0.3257 0.0346 237.74)
- danger: oklch(0.8195 0.1011 23.21)

## 实现验收

1440px 桌面与 390px 手机浏览器验收通过：桌面页面无横向溢出、同周日期头部对齐；手机仅日历容器横向滚动，日程视图完整可读。重点筛选与 CPI 搜索组合返回一致；日期详情保留完整标题、关注理由和来源；Escape 关闭后回到原日期。下个重点清除搜索并定位正确日期；月份切换、规则与来源弹层正常。浏览器无 warning/error。TypeScript 与生产构建通过，7 项测试通过。

Pre-flight score（0–2，2 为满足）：单一设计方向 2；日历主任务聚焦 2；设计系统实际使用 2；色彩/字体一致 2；状态与键盘交互 2；响应式 2。移动月历保留内层横滚的取舍明确，并提供同级日程视图。
