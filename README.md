# Weread Reading Dashboard

Weread Reading Dashboard 是一个 Obsidian 桌面端插件，用于同步微信读书书架、阅读进度、划线、想法与阅读统计，并提供阅读看板、完整书架、书籍详情、知识中心和回顾中心。

> 本仓库用于公开分发编译后的插件文件。开发源码保存在独立的私有源码仓库中。

## Beta 安装（推荐）

当前 Beta 通过 BRAT 分发。

1. 在 Obsidian 中打开「设置 → 第三方插件 → 浏览」。
2. 搜索并安装 **BRAT**，然后启用。
3. 打开「设置 → BRAT」。
4. 选择 **Add Beta Plugin**。
5. 输入本仓库地址：`https://github.com/libaiwan925/weread-reading-dashboard`。
6. 安装完成后，在「设置 → 第三方插件」中启用 **Weread Reading Dashboard**。
7. 打开插件设置，填写微信读书 API Key。
8. 第一次同步建议使用 Full Sync，后续日常刷新使用 Quick Sync。

## 手动安装（备用）

从 GitHub Releases 下载同一版本的：

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

仓库根目录保存公开发行元数据；每个 GitHub Release 附带：

```text
main.js
manifest.json
styles.css
```

版本号必须与 GitHub Release tag 完全一致。

## License

Copyright © 2026 libaiwan. See `LICENSE`.
