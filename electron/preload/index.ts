import { contextBridge, ipcRenderer } from 'electron'
import type { ScheduleAPI, ScheduleData } from '../../src/types'

const api: ScheduleAPI = {
  loadData: () => ipcRenderer.invoke('schedule:load'),
  saveData: (data: ScheduleData) => ipcRenderer.invoke('schedule:save', data),
  showWindow: () => ipcRenderer.invoke('window:show'),
  quit: () => ipcRenderer.invoke('app:quit'),
  platform: process.platform,
}

contextBridge.exposeInMainWorld('scheduleAPI', api)
