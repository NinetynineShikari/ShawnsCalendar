import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScheduleData, SaveResult } from '../../src/types'
import { DataStore } from './storage'
import { ReminderService } from './reminders'

const dirname = path.dirname(fileURLToPath(import.meta.url))
// Keep the existing storage location after the product rename so installed
// users retain all todos, goals, journals and settings across the upgrade.
app.setPath('userData', path.join(app.getPath('appData'), 'mori-schedule'))
const store = new DataStore()
const reminders = new ReminderService()
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const TRAY_ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAgUlEQVR4nO2T0RXAIAgDIc/9V7YTSKE1YK33HROMKHIoRh2aHtSHzkCK0cBNKDlICDe9kBBueiIpfOgNKaY5NN6vN8JsFOTwWw9IMfjCDvStn6A5NDMWcd0GsOsS6lYNKHMAMM1/t4TKaKA/MY14KDHYlQevkBFuDTB7COpXPsgbLoN6ED4QPhKXAAAAAElFTkSuQmCC'

function createTrayIcon() {
  const assetPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'trayTemplate.png')
    : path.join(app.getAppPath(), 'assets', 'trayTemplate.png')
  let image = nativeImage.createFromPath(assetPath)
  if (image.isEmpty()) {
    image = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG, 'base64')).resize({ width: 16, height: 16 })
  }
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (!mainWindow) return
  if (process.platform === 'darwin') {
    app.show()
    if (app.dock) void app.dock.show()
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function sendTestNotification(): Promise<void> {
  if (process.platform === 'darwin') {
    app.hide()
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const result = await reminders.showTestNotification()
  const accepted = result.status === 'shown'
  showWindow()
  const options: Electron.MessageBoxOptions = {
    type: accepted ? 'info' : 'warning',
    title: '通知测试',
    message: accepted ? '测试通知已提交给系统' : '测试通知未能正常显示',
    detail: accepted
      ? '如果没有看到右上角的通知横幅，请检查 macOS“系统设置 → 通知 → Shawn\'s Calendar”中的通知权限和提醒样式。'
      : result.detail,
    buttons: process.platform === 'darwin' ? ['知道了', '打开通知设置'] : ['知道了'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  }
  const response = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options)
  if (process.platform === 'darwin' && response.response === 1) {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications')
  }
}

function createTray(): void {
  if (tray) return
  const trayIcon = createTrayIcon()
  tray = new Tray(trayIcon)
  tray.setToolTip("Shawn's Calendar")
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示 Shawn's Calendar", click: showWindow },
    { label: '发送测试通知', click: () => { void sendTestNotification() } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
  if (process.platform !== 'darwin') tray.on('double-click', showWindow)
}

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{
      label: "Shawn's Calendar",
      submenu: [
        { role: 'about' as const, label: "关于 Shawn's Calendar" },
        { type: 'separator' as const },
        { label: "隐藏 Shawn's Calendar", accelerator: 'Command+H', role: 'hide' as const },
        { label: '隐藏其他应用', accelerator: 'Command+Alt+H', role: 'hideOthers' as const },
        { type: 'separator' as const },
        { label: "退出 Shawn's Calendar", accelerator: 'Command+Q', click: () => { quitting = true; app.quit() } },
      ],
    }] : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: "显示 Shawn's Calendar", accelerator: 'CommandOrControl+0', click: showWindow },
        { label: '发送测试通知', click: () => { void sendTestNotification() } },
        { type: 'separator' },
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 680,
    title: "Shawn's Calendar",
    backgroundColor: '#f5f7f3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(dirname, 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(process.resourcesPath, 'renderer', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      const windowToClose = mainWindow
      mainWindow = null
      // A hidden full-screen BrowserWindow can leave an empty black Space on
      // macOS. Destroy the window while keeping the tray process alive; it is
      // recreated when the user opens the app again.
      windowToClose?.destroy()
      if (process.platform === 'darwin') {
        app.hide()
        if (app.dock) void app.dock.hide()
      }
    }
  })
}

app.setName("Shawn's Calendar")
if (process.platform === 'win32') app.setAppUserModelId('com.shawn.mori-schedule')

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  const data = await store.load()
  reminders.sync(data)
  createWindow()
  createTray()
  createApplicationMenu()
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: "显示 Shawn's Calendar", click: showWindow },
      { label: '发送测试通知', click: () => { void sendTestNotification() } },
    ]))
  }
  if (process.argv.includes('--test-notification')) {
    setTimeout(() => { void sendTestNotification() }, 1200)
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    showWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
  reminders.clear()
})

app.on('window-all-closed', () => {
  // Keep running in the tray on both macOS and Windows.
})

ipcMain.handle('schedule:load', async () => store.load())
ipcMain.handle('schedule:save', async (_event, data: ScheduleData): Promise<SaveResult> => {
  try {
    const savedAt = await store.save(data)
    reminders.sync(data)
    return { ok: true, savedAt }
  } catch (error) {
    return { ok: false, savedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }
  }
})
ipcMain.handle('window:show', () => showWindow())
ipcMain.handle('app:quit', () => {
  quitting = true
  app.quit()
})
