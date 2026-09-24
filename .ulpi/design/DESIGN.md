---
project: 市历
register: product
aesthetic_direction: technical / utilitarian
color_strategy: restrained
design_system: Bootstrap 5.3 CSS with native HTML controls
motion_intensity: 1
visual_density: 8
---

# 市场日程终端

Every screen must read as the same product if placed side by side.

用户明确要求单页、金融终端风格，不需要添加、个人管理、事件分类或侧边导航。密度服务于日程扫描，不添加装饰性图表、行情或未经提供的数值。

## 设计识别

深石墨色工作区、连续细网格、等宽日期与时间。唯一醒目标记是带文字的琥珀色“重点”标识，配合重点日期左侧线条；不用红绿涨跌色表示重要程度。内容只有紧凑标题工具栏和完整大日历。选中日期详情在点击后打开侧向dialog，不常驻占用日历空间。取消宣传标题与英文 eyebrow 编号。

## 样式基础与令牌

使用真实 Bootstrap CSS（从本项目 npm 依赖导入）及原生 button/select/dialog。使用 `.btn`、`.form-select`、`.badge` 等组件，覆盖 Bootstrap 主题变量；日历网格为项目定制组件。无需引入 React 或 Bootstrap JS。Bootstrap 默认圆角、颜色统一被下列令牌覆盖。

| Role | Hex | Usage |
|---|---|---|
| background | #10181e | 页面底色 |
| surface | #18232b | 日历、工具条 |
| elevated | #20303a | hover、选中详情 |
| text | #e7eef0 | 正文 |
| muted | #a4b3ba | 来源与次要说明 |
| accent | #7ebbc6 | 当前日期、选择、焦点、链接 |
| border | #374953 | 连续网格 |
| high / high-bg | #f1c779 / #342d21 | 重点关注 |
| medium / medium-bg | #9fc8d9 / #233744 | 值得留意 |
| danger | #ffaaa5 | 来源失败 |

主体为冷色中性底（60%）、表面（30%）、语义与选择（10%以内），禁用渐变、发光、玻璃背景、装饰性状态灯、三张等宽特性卡、嵌套卡、超大宣传标题。无虚构金融指标。对比度由根任务计算并记录在 feature spec。

Typography: Noto Sans SC 为中文正文，IBM Plex Sans 为拉丁字母，IBM Plex Mono 为时间与计数。正文 14px，事件标签 12px（移动端最低11px），次要说明12px，标题24px。金融排期适合无衬线与等宽数字，移除原来的衬线宣传文案。

Spacing: 0, 2, 4, 8, 12, 16, 20, 24, 32px。Radius: 0,4,8px，标签4px。边线1px，focus2px。无动画，仅状态hover 100ms ease-out，reduced-motion关闭。

## 响应式

>=1200px：页面全宽最大1760px；日历占据全部宽度，点击日期后打开400px侧向dialog；无常驻左右栏。网格单元高度100–112px，完整展示3条优先事件再显示剩余数量。
768–1199px：月份工具栏可换行，详情用原生dialog；保留信息密度。
<768px：工具分两行，按月份、时区、重要筛选分组；网格可在本身容器水平滚动（最小宽度630px），页面无整体溢出。不显示独立近期重点区；日程视图可一键切换，字号保持可读。目标控件最小44px。

## 当前页面的文字

标题：市场日历。说明：宏观 · 央行 · 财报 · 交易安排（普通描述，无可点击分类）。
重点说明：本站关注规则，非官方评级；不表示确定的行情方向。
操作：只看重点、全部日程、月历、日程、今天、分级依据、数据来源。
