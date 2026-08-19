# Weread Reading Dashboard

Weread Reading Dashboard 是一个 Obsidian 桌面端插件，用于同步微信读书书架、阅读进度、划线、想法与阅读统计，并提供阅读看板、完整书架、书籍详情、知识中心和回顾中心。

## Beta 安装（推荐）

### 第一次安装

1. 在 Obsidian 打开「设置 → 第三方插件 → 浏览」。
2. 搜索 **BRAT**，安装并激活。
3. 然后使用下面任意方式安装阅迹可视化看板。

### 通过 BRAT 安装

1. 打开「设置 → BRAT」。
2. 在 **Beta 插件列表** 右侧点击 **+**。
3. 输入：

```text
https://github.com/libaiwan925/weread-reading-dashboard
```

粘贴后点击 **Add plugin** 即可。

### 手动安装（备用）

如果不使用 BRAT，可以从同一版本的 GitHub Release 下载：

- `main.js`
- `manifest.json`
- `styles.css`

将三个文件放入：

```text
<Vault>/.obsidian/plugins/weread-reading-data/
```

然后重启或重新加载 Obsidian，并在第三方插件中启用。

### 安装完成后

1. 确认「设置 → 第三方插件」中 **Weread阅读仪表板** 已启用。
2. 打开插件设置，填写微信读书 API Key。
3. 在阅读看板里点击刷新，或者在插件高级设置页里点击「重新同步全部数据」。

## 数据与隐私

- API Key 使用 Obsidian SecretStorage 保存，不写入 Vault 内容文件。
- 插件会访问微信读书相关远程接口以执行同步。
- 阅读数据保存在用户自己的 Vault 中。
- 本发行仓库不包含用户 API Key、真实阅读数据或个人 Vault 数据。

## 平台

- Desktop only
- 最低 Obsidian 版本见 `manifest.json` 中的 `minAppVersion`

## 发布内容

Public Release Repo 中保存公开发行所需的编译产物与元数据；每个 GitHub Release 提供：

```text
main.js
manifest.json
styles.css
```

GitHub Release tag、`manifest.json.version` 与运行时版本必须一致。

## License

Copyright © 2026 libaiwan. See `LICENSE`.
