# Shawn's Calendar

一款完全本地运行的跨平台桌面日程工具，由旧版 `scheduleV_2.py` 重写而来。

## 功能

- 按日期管理待办，支持直接编辑、完成、重点标记和删除
- 一次性与每周重复提醒，默认提前 5 分钟发送系统通知
- 每周目标与每日日记，支持加粗、斜体、下划线、删除线和高亮
- 自动保存、系统托盘驻留、深色模式
- 首次启动自动导入旧版 `schedule_data.json`，原文件会备份且不会被覆盖
- macOS 与 Windows 使用同一套代码构建

## 开发

```bash
npm install
npm run dev
```

## 打包

macOS（需在 macOS 上执行）：

```bash
npm run package:mac
```

Windows（建议在 Windows 上执行）：

```bash
npm run package:win
```

产物位于 `release/`。正式分发时可在对应平台补充代码签名；未签名构建也可用于个人本机安装。

应用数据位于 Electron 的用户数据目录中。首次导入时会依次查找旧版的 `~/.simple_schedule/schedule_data.json`、当前目录中的 `schedule_data.json` 和安装包内置的迁移数据。
