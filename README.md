# 市历 · Market Calendar

TypeScript + Vite 的美股事件日历。聚合美国宏观数据、美日央行会议、行业代表公司财报与中美交易假期，以全宽月历为主体，提供日程列表、搜索、重点筛选与按日详情。Bootstrap 控件与深色金融终端样式突出重要事件。无需登录，无需付费数据源或 API Key。

## 本地运行

使用 Node.js 24 LTS 和 npm：

```sh
npm ci
npm run dev
```

仓库包含一次真实同步生成的 `public/data/events.json`，本地开发不必每次请求外部服务。刷新数据：

```sh
npm run sync
npm test
npm run build
npm run preview
```

`npm run sync` 请求公开互联网，需要网络可达。`npm run build` 包含严格 TypeScript 检查。测试包含真实来源响应的解析、夏令时、跨日显示、筛选组合与结构变化时报错的行为；无需网络。

`npm run verify:feed` 校验生成数据的结构及完整来源状态；工作流还通过 `SYNC_STARTED_AT` 检查是否为本次同步生成的数据。单元测试使用固定来源样本，不依赖实时日程是否包含某家公司财报。

## GitHub Pages

1. 将项目提交并推送到 `noneback/calender` 的 `main` 分支。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 运行 **Actions → Update calendar and deploy Pages → Run workflow**，或通过推送触发。
4. 首次部署成功后访问 <https://noneback.github.io/calender/>。

工作流每天 UTC 00:17、12:17（北京时间 08:17、20:17）同步并重新部署，也支持手动触发。调度由 GitHub 执行，可能延迟；公共仓库长期无活动时，GitHub 可能停用定时工作流，需要重新启用。项目仓库名已知，Vite 使用相对资源路径，同时支持仓库子路径和自定义域名，不依赖 SPA 路由重写。

仓库代码本身不会在同步时自动提交。最新事件随部署产物发布，不会每天产生数据提交。来源失败时，失败来源的事件不发布，网页显示具体错误；成功来源仍能查看，部署后的工作流最终标记为失败，便于在 GitHub Actions 定位。网页显示同步时间，超过 36 小时未更新会提示。

部署前先运行固定样本测试，再移除仓库中的旧数据并同步。只有本次新生成且通过校验的数据才会构建发布；若同步程序崩溃、没有写出文件或写出无效数据，部署会停止，保留线上版本。GitHub 托管 runner 未分配等平台故障仍需等待平台恢复或重新运行，程序内重试不能修复 runner 分配失败。

## 数据范围

| 内容 | 免费来源 | 同步范围与语义 |
| --- | --- | --- |
| CPI、非农、PPI、PCE、GDP、初请、JOLTS、ISM、零售、消费者调查 | [纽约联储经济日历](https://www.newyorkfed.org/research/calendars/nationalecon_cal) | 当前月及随后两个月，按来源已公布条目筛选 |
| 三巫日／四巫日（合并提醒） | [CME 美国股指到期表](https://www.cmegroup.com/trading/equity-index/rolldates.html) | 当年及已公布未来季度；读取到期列，保留假期调整，作为集中到期窗口提醒，具体合约最后交易及结算时间以交易所为准 |
| FOMC | [美联储](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) | 当年及官网已公布未来年份，记录会议首末日 |
| 日本央行政策会议 | [日本央行](https://www.boj.or.jp/en/mopo/mpmsche_minu/) | 当年及已公布未来年份，决议时间未知时保留日本日期 |
| 美国股市假期、提前收市 | [NYSE](https://www.nyse.com/markets/hours-calendars) | 官网公布年份；不会把银行假日直接当成股票休市日 |
| 中国节假日与 A 股休市 | [上交所](https://www.sse.com.cn/disclosure/dealinstruc/closed/) | 官网年度安排，包括假期内周末；不代表港股、美股同时休市 |
| 自动行业代表公司 | [iShares IVV 持仓](https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf) | 每个行业权重前三，加整体权重前十，合并同公司不同股份类别；随持仓刷新 |
| 预估财报 | [Nasdaq](https://www.nasdaq.com/market-activity/earnings) | 查询同步当日及未来 45 天，只保留自动公司清单中的事件 |

财报日期可能基于历史报告规律估算，**不是公司确认公告**，页面明确标记“预估”。自动公司池来自标普 500 ETF，并不覆盖全部 ADR、中概股或行业细分龙头。央行会议不代表已经确定加息，也不预测波动方向或持续天数。

当前不包含突发新闻、地缘事件的自动识别，也不提供经济数据预测值、实际值、行情或交易信号。节日范围为交易所休市相关节日，不是完整的中美民俗节日库。公开来源可能修改结构或访问限制，解析失败会显式报错，不会编造日期或悄悄沿用旧数据。

## 项目结构与数据语义

- `scripts/`：TypeScript 同步与来源解析；每次请求有超时和最多三次带日志的重试，数据以 Zod 校验。
- `src/model.ts`：事件、来源状态与个人数据的类型及运行时校验；时间计算。
- `src/importance.ts`：根据事件类型与自动公司池权重计算关注等级及解释。
- `src/view.ts`、`src/main.ts`、`src/style.css`：展示、交互与响应式布局。
- `public/data/events.json`：自动生成的公开事件数据。
- `tests/fixtures/`：来自真实官方／供应商响应的测试片段，捕获于 2026-09-24/25。

GitHub Pages 只能提供静态文件，因此将数据获取放在 GitHub Actions 中，再生成 JSON 供前端读取；浏览器无需跨域访问第三方，也不需要暴露密钥。使用原生 TypeScript 界面，避免为单页日历引入服务端或数据库。

定时事件以 UTC 存储，按 IANA `America/New_York` 和 `Asia/Shanghai` 规则显示；全天与时间待定事件保留来源当地日期。重点事件在日期格中优先展示，详情解释关注原因；评级规则见 `src/importance.ts`，属于本站编辑规则，不代表确定的波动方向或幅度。

时区偏好保存在当前浏览器的 `localStorage`。旧版保存的个人数据保留在原存储中，当前页面仅展示自动同步的公开日程；损坏的数据或不可用的浏览器存储会显式报错，不自动清空。
