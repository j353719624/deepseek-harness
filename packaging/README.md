# DSH Desktop — 本地重建与分发仓库

本仓库是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 fork，
只用于分发**基于官方源码构建的 Linux 桌面安装包**，并托管应用内更新所需的清单文件。

- 上游源码：https://github.com/deepseek-ai/deepseek-harness （MIT）
- 构建基线版本：0.2.2-rc.5（Electron 44.7.0 + dsh 0.2.2-rc.5 + Node 24.21.0 + Python 3.12.14 + pnpm 11.28.5）
- 本仓库发布版本：见 Releases（`0.2.2-rc.5.1` 起）

## 相对官方包改了什么

1. **删除平台无关负载**（约 -206 MB 解包后）
   - `@deepseek-ai/libreoffice-kit-win32-x64`（192 MB，package.json 声明 `"os":["win32"]`，Linux 不可加载）
   - `@vscode/ripgrep-win32-x64`、`@koromix/koffi-win32-x64`
   - `*.test.*` / `__tests__` / `zod/src`
   - 保留 `@deepseek-ai/dsh-win32-process`：它是 `dsh-subprocess-local` 的**静态 ESM 依赖**，删除会导致 subprocess 层加载失败。
2. **补上 Linux 的 Office 引擎**：加入官方 `@deepseek-ai/libreoffice-kit-wasm@0.2.3`
   （上游没有 linux 原生引擎，kit 的解析顺序是 native → wasm，之前两者都缺，`office_*` 一律 `unavailable`）。
3. **菜单汉化**：`packaging/patches/i18n.patch`（Electron role 菜单标签在 Linux 上硬编码英文）。
4. **检查更新**：`packaging/patches/update-check.patch`（无更新源时优雅降级 + 支持 `<userData>/app-update.yml`）。
5. **打包配置**：`resources/app-update.yml`（GitHub provider）+ `resources/package-type`（`deb`），
   使 electron-updater 使用 `DebUpdater` 而不是 AppImage 分支。

## 版本号约定（重要）

- dpkg 版本与 semver **都要**能比较：使用 `0.2.2-rc.5.1` 这类形式。
- 不要用 `+slimN` 作为对外发布版本：semver 会忽略 `+` 后的 build metadata，
  electron-updater 的 `isUpdateAvailable()` 会判定为「没有更新」。

## 发布（每个版本）

1. 构建：`packaging/build-deb.sh`（示例命令，按你的构建目录调整）
2. 生成 `latest-linux.yml` / `nightly-linux.yml`（sha512 为 **base64**）
3. 创建 Release（tag = `v<version>`，非 prerelease），上传：
   - `dsh-desktop_<version>_amd64.deb`
   - `latest-linux.yml`
   - `nightly-linux.yml`
4. 客户端：安装 deb 后，应用内「检查更新」会读取
   `https://github.com/j353719624/deepseek-harness/releases/download/v<tag>/latest-linux.yml`，
   比对 semver 后下载 deb，并通过 `pkexec/sudo` 调 `dpkg -i` 安装。

> 注意：仓库必须保持 **public**，否则 electron-updater 需要客户端额外提供 token。

## 许可

上游为 MIT；本仓库的修改与打包脚本同样以 MIT 提供。二进制内含 Electron/Chromium
与第三方组件，其许可随包内 `LICENSE`、`LICENSES.chromium.html` 分发。
