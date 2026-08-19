# Weread Reading Dashboard

Weread Reading Dashboard 是一个 Obsidian 桌面端插件，用于同步微信读书书架、阅读进度、划线、想法与阅读统计，并提供阅读看板、完整书架、书籍详情、知识中心和回顾中心。

> 本仓库用于公开分发编译后的插件文件。开发源码保存在独立的私有源码仓库中。

## Beta 安装（推荐）

当前 Beta 通过 **BRAT** 分发。

### 第一次安装

BRAT 是 Beta 安装入口，因此首次使用前需要先安装并启用 BRAT：

1. 在 Obsidian 打开「设置 → 第三方插件 → 浏览」。
2. 搜索 **BRAT**，安装并启用。
3. 然后使用下面任一方式安装 Weread Reading Dashboard。

### 方式 A：BRAT 一键打开

BRAT 已安装并启用后，可使用：

[使用 BRAT 安装 Weread Reading Dashboard](obsidian://brat?plugin=https%3A%2F%2Fgithub.com%2Flibaiwan925%2Fweread-reading-dashboard&version=latest)

如果客户端没有把上面的协议链接渲染为可点击链接，也可以复制：

```text
obsidian://brat?plugin=https%3A%2F%2Fgithub.com%2Flibaiwan925%2Fweread-reading-dashboard&version=latest
```

### 方式 B：在 BRAT 中手动添加

1. 打开「设置 → BRAT」。
2. 选择 **Add Beta Plugin**。
3. 输入：

```text
https://github.com/libaiwan925/weread-reading-dashboard
```

4. 版本选择器可以**保持默认的 `Select a version` 不操作**，然后直接点击 **Add plugin**。这种情况下 BRAT 会安装当前最新 Release，并继续跟踪后续新版本。
5. 如果手动打开版本菜单，普通 Beta 用户建议选择 **Latest version**。
6. 只有需要做旧版本回归测试时，才选择具体版本（例如 `1.0.0`）；具体版本会固定在该版本，不跟随新版本更新。
7. 建议保留 **Enable after installing the plugin** 勾选。

### 安装完成后

1. 确认「设置 → 第三方插件」中 **Weread Reading Dashboard** 已启用。
2. 打开插件设置，填写微信读书 API Key。
3. 第一次同步建议使用 **Full Sync**。
4. 后续日常刷新使用 **Quick Sync**。

## 当前 Beta 版本

当前公开 Beta 基线：`1.0.0`。

Beta 用户建议跟踪 **Latest version**，这样后续 `1.0.1`、`1.0.2` 等版本发布后可以继续通过 BRAT 更新。

## 手动安装（备用）

如果不使用 BRAT，可以从同一版本的 GitHub Release 下载：

- `main.js`
- `manifest.json`
- `styles.css`

将三个文件放入：

```text
<Vault>/.obsidian/plugins/weread-reading-data/
```

然后重启或重新加载 Obsidian，并在第三方插件中启用。

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
