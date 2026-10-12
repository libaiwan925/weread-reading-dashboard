# Changelog

## 1.0.1 — 2026-10-12

### Fixed

- 微信读书 Agent Skill 请求版本升级至官方 1.0.5，修复旧协议被网关 `upgrade_info` 阻止而无法验证 API Key / 同步的问题。
- 升级协议时显示明确的插件更新提示；失败验证不会覆盖现有 API Key。

### Compatibility

- 保留现有书架、划线、阅读统计、Quick/Full Sync、数据 Schema 以及「继续阅读」打开方式。
- 本版本不包含未合入的 V2、Apple Books、关注主题开发功能。


## 1.0.0 — 2026-08-17

首个公开 Beta 发布基线。

### Added

- 微信读书书架、进度、划线、想法、阅读统计同步。
- 阅读首页、完整书架、书籍详情、知识中心、回顾中心 5 个 Native View。
- Quick / Full Sync、失败重试、partial 降级、canonical 发布与 UI 消费校验。
- 周/月/年回顾及按 `bookId` 独立保存的本地书评。
- `overall.preferTime` 阅读时段分布与 06:00 起始桶标准化。
- SecretStorage API Key 管理与设置页“获取”入口。
- 故障排查诊断。

### Distribution

- Desktop only。
- 1.0.0 作为首个 Public Beta / BRAT 分发版本。
- GitHub Release 提供 `main.js`、`manifest.json`、`styles.css` 三个标准 Obsidian 插件资产。
- 本公开发行仓库不包含私有开发源码、真实用户数据或 API Key。
