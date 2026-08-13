# Shawn's Calendar

一款轻量、安静、完全本地运行的桌面日程工具。项目由早期的 Tkinter 版本 `scheduleV_2.py` 重写而来，在保留原有能力的基础上，重新设计了界面、交互、数据安全和系统集成。

当前版本：**3.0.0**

## 平台支持

| 平台    | 架构                                 | 构建产物                    | 当前状态                                  |
| ------- | ------------------------------------ | --------------------------- | ----------------------------------------- |
| macOS   | Apple Silicon（arm64）、Intel（x64） | `.app`、DMG、ZIP            | arm64 已在 macOS 实机验证                 |
| Windows | x64、arm64                           | NSIS 安装程序、Portable EXE | 已配置构建，发布前仍需在 Windows 实机验收 |

应用使用同一套 Electron、React 和 TypeScript 代码运行于 macOS 与 Windows，不依赖服务器，也不会上传日程数据。

## 主要功能

- 通过日历选择日期并管理每日待办
- 新建、行内编辑、完成、重点标记和删除待办
- 拖动待办调整顺序，并实时显示插入位置
- 为待办设置一次性或每周重复提醒
- 默认提前 5 分钟提醒；不足提前量时改为在事项时间提醒
- 按自然周记录本周目标
- 按日期记录日记
- 周目标和日记支持粗体、斜体、下划线、删除线与高亮
- 浅色、深色和跟随系统主题
- 自动保存、原子写入和会话备份
- 菜单栏或系统托盘后台驻留
- 兼容并自动迁移旧版 `schedule_data.json`

## 使用方式

### macOS

将 `Shawn's Calendar.app` 放入 `/Applications`，然后从“应用程序”或 Launchpad 启动。

点击窗口左上角红色关闭按钮只会关闭窗口，后台进程会继续运行，以便发送待办提醒。可以通过菜单栏日历图标重新显示窗口；需要彻底退出时，请在菜单栏图标中选择“退出”，或使用应用菜单中的退出命令。

如果系统没有显示通知，请检查：

```text
系统设置 → 通知 → Shawn's Calendar
```

确认“允许通知”已开启，并选择“横幅”或“提醒”样式。菜单中提供了“发送测试通知”用于诊断通知状态。

### Windows

面向普通用户时建议安装 NSIS 版本，而不是 Portable 版本。安装版会创建开始菜单和桌面快捷方式，也更适合后续覆盖升级及系统通知。

关闭主窗口后，应用仍会在系统托盘运行。若希望停止提醒并彻底结束程序，请从托盘菜单选择“退出”。

## 数据、隐私与备份

所有数据只保存在当前用户的本地设备上，不使用账号、云端数据库或网络同步。

数据文件位置：

| 平台    | 默认位置                                                         |
| ------- | ---------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/mori-schedule/schedule_data.json` |
| Windows | `%APPDATA%\mori-schedule\schedule_data.json`                     |

虽然产品名称已经改为 Shawn's Calendar，但内部应用标识和数据目录有意继续使用 `mori-schedule`，以确保旧版本升级后仍能读取原有数据。不要在没有迁移方案的情况下修改 `appId`、npm 包名或 `userData` 路径。

应用采用临时文件写入并原子替换正式数据文件，降低写入中断造成数据损坏的风险。每次运行会在首次保存前备份已有数据。备份位于：

```text
<上述数据目录>/backups/
```

覆盖安装或升级应用不会删除用户数据。卸载前若需要彻底保留个人数据，建议手动复制整个 `mori-schedule` 数据目录。

## 旧版数据迁移

仓库中的以下文件是历史版本及其示例数据，需继续保留：

- `scheduleV_2.py`：原 Tkinter 版本
- `schedule_data.json`：旧版数据文件，也是打包时的迁移来源

首次启动且新数据目录中没有 `schedule_data.json` 时，应用会依次查找：

1. `~/.simple_schedule/schedule_data.json`
2. 当前工作目录中的 `schedule_data.json`
3. 安装包内置的 `legacy-data/schedule_data.json`

找到数据后会先备份原文件，再迁移到当前 schema。应用不会覆盖旧版原始文件。

## 技术架构

- Electron：独立桌面窗口、菜单栏/托盘、系统通知和本地文件访问
- React + TypeScript：界面与应用状态
- Vite：开发服务器与前端构建
- Electron Builder：macOS 和 Windows 安装包
- Vitest：数据迁移、提醒调度与富文本逻辑测试

应用保持本地单体架构，没有单独后端。Electron 主进程负责文件存储、提醒和系统生命周期；渲染进程只通过受限的 preload API 与主进程通信，并启用了 `contextIsolation` 和 sandbox。

## 开发环境

建议使用满足 Vite 8 要求的 Node.js 版本：Node.js 20.19+ 或 22.12+，以及随 Node.js 提供的 npm。

安装依赖并启动开发环境：

```bash
npm install
npm run dev
```

常用命令：

| 命令                     | 用途                                           |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | 启动 Vite 与 Electron 开发环境                 |
| `npm test`               | 运行全部自动测试                               |
| `npm run test:watch`     | 监听文件并持续运行测试                         |
| `npm run build`          | 类型检查并构建 renderer、main 和 preload       |
| `npm run package:mac`    | 构建 macOS DMG 与 ZIP                          |
| `npm run package:win`    | 构建 Windows NSIS 与 Portable 版本             |
| `npm run sign:mac:local` | 对本机 arm64 `.app` 进行 ad-hoc 临时签名并校验 |

构建产物默认写入 `release/`，该目录不会提交到 Git。

## 构建与安装包

### macOS 本机构建

```bash
npm run package:mac
```

当前配置会生成 arm64 和 x64 的 DMG 与 ZIP。开发中若只需要当前 Apple Silicon 机器的未压缩 `.app`，可以使用：

```bash
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --mac --arm64 --config.electronDist=node_modules/electron/dist
npm run sign:mac:local
```

`sign:mac:local` 只是 ad-hoc 本地签名，适合本人机器测试，不等同于正式的 Developer ID 签名和 Apple 公证。面向其他 Mac 用户发布前，应使用 Apple Developer 证书签名、提交 notarization，并 staple 公证结果。DMG 只是安装载体，本身不能代替签名和公证。

### Windows 构建

建议在 Windows x64 机器或 Windows CI Runner 上执行：

```bash
npm install
npm test
npm run package:win
```

只构建适合大多数 Windows 电脑的 x64 NSIS 安装程序：

```bash
npm run build
npx electron-builder --win nsis --x64
```

Windows 安装包目前没有正式代码签名，首次下载或运行时可能触发 SmartScreen 提示。长期对外分发时应增加 Windows 代码签名，并在真实 Windows 环境验收安装、卸载、托盘、通知以及覆盖升级。

## 版本发布与升级

项目使用语义化版本号：

- `3.0.1`：兼容性修复或小问题修正
- `3.1.0`：向后兼容的新功能
- `4.0.0`：包含不兼容变化的大版本

一次常规发布建议按以下顺序进行：

1. 修改代码并补充相应测试
2. 运行 `npm test` 和 `npm run build`
3. 同步更新 `package.json` 与 `package-lock.json` 中的版本号
4. 在目标平台生成安装包
5. 在真实 macOS/Windows 环境完成安装和数据验收
6. 提交代码并创建对应的 Git tag，例如 `v3.0.1`
7. 发布安装包并保留上一版本作为回退

当前没有自动更新功能。发布新版后：

- macOS：退出旧版本，将新 `.app` 覆盖到 `/Applications`；用户数据会保留
- Windows：直接运行新版 NSIS 安装程序覆盖安装，无需先卸载旧版本；用户数据会保留

为了保证覆盖升级正确识别为同一应用，应保持 `appId`、产品安装配置和数据目录稳定。若未来加入自动更新，建议使用经过正式签名的安装包，并通过 GitHub Releases 或等价发布服务提供版本元数据与文件。

## 项目结构

```text
assets/                 应用图标和菜单栏模板图源文件
build/                  Electron Builder 使用的应用图标
electron/main/          主进程、数据存储与提醒调度
electron/preload/       渲染进程可使用的受限 API
src/components/         React 界面组件
src/lib/                日期与富文本逻辑
src/App.tsx             应用状态及主要交互
scheduleV_2.py          保留的旧版 Python 程序
schedule_data.json      旧版数据及首次迁移来源
package.json            依赖、版本、脚本和打包配置
```

## 当前发行状态与限制

- 当前版本为 `3.0.0`
- macOS arm64 版本已完成本机功能测试
- macOS 构建目前仅作本地 ad-hoc 签名，尚未 Developer ID 签名或公证
- Windows 构建流程已配置，但仍需在 Windows 实机完成发行验收
- Windows 安装包尚未代码签名
- 当前不支持云同步、多设备同步或自动更新
- 提醒依赖应用后台进程；从菜单彻底退出后不会继续发送提醒
- 系统休眠、电源策略和操作系统通知设置可能影响提醒出现时间
