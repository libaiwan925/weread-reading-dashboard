# Changelog

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
