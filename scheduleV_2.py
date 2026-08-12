# -*- coding: utf-8 -*-
"""
ScheduleApp v2 — CustomTkinter 版（Grid 布局，无 CTkPanedWindow）

变更要点（本次修订）：
- 将“浮动工具条”改为**内嵌工具条**（非 Toplevel），固定显示在文本框右上角，彻底解决白框/闪烁/遮挡问题。
- 左侧日历宽度**固定**（不随窗口缩放），右侧自适应；顺带修复打开提醒弹窗后布局被“归位”的问题。
- 待办列表维持浅灰外框；斑马纹保留。
- 其余功能保持：富文本（B/I/U/S/高亮）、提醒（一次性/每周重复，提前5分钟）、系统托盘驻留、数据兼容。

依赖：
    pip install customtkinter tkcalendar apscheduler plyer pystray pillow win10toast
"""
import os
import json
import uuid
import ctypes
import datetime as dt
import threading
from pathlib import Path

import customtkinter as ctk
import tkinter as tk
from tkinter import ttk, messagebox
from tkcalendar import Calendar, DateEntry

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.cron import CronTrigger

from plyer import notification

# 托盘
import pystray
from PIL import Image, ImageDraw

try:
    from win10toast import ToastNotifier
    WIN_TOAST = ToastNotifier()
except Exception:
    WIN_TOAST = None

APP_NAME = "极简日程管理 2.0"
SCHEMA_VERSION = 2

# --- DPI 与主题 --------------------------------------------------------------
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)  # type: ignore[attr-defined]
except Exception:
    pass

ctk.set_appearance_mode("light")

# 自定义配色
GREEN_LIGHT = "#DDECE3"   # 法式浅绿
GREEN_DEEP  = "#1F3B2D"   # 雪松深绿
ACCENT      = "#2F5E49"
TEXT_DARK   = "#222222"
BORDER      = "#E6EEE9"
HL_BG       = "#FFF3BF"   # 柔和高亮底
HL_FG       = "#B57700"

# --- 字体（工具条图标） -----------------------------------------------------
# 对 CTk 组件，font 必须是 tuple 或 CTkFont，这里统一用 CTkFont。
# Text 的 tag 配置仍使用 tuple（与 Tk 兼容）。
import tkinter.font as tkfont  # 仅用于 Text 的 tag tuple，不直接传给 CTk 组件

# --- 数据文件位置 ------------------------------------------------------------
DATA_DIR = Path.home() / ".simple_schedule"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATA_FILE = DATA_DIR / "schedule_data.json"
LEGACY_FILE = Path("schedule_data.json")
if LEGACY_FILE.exists() and not DATA_FILE.exists():
    try:
        DATA_FILE.write_bytes(LEGACY_FILE.read_bytes())
    except Exception:
        pass

# --- 工具函数 ----------------------------------------------------------------

def week_start(date_str: str) -> str:
    d = dt.datetime.strptime(date_str, "%Y-%m-%d")
    ws = d - dt.timedelta(days=d.weekday())
    return ws.strftime("%Y-%m-%d")


# --- 内嵌工具条 --------------------------------------------------------------
class InlineToolbar(ctk.CTkFrame):
    """嵌入式小工具条，放在目标容器内右上角。"""
    ORDER = ["b", "i", "u", "s", "hl"]

    def __init__(self, parent, fonts: dict):
        super().__init__(parent, fg_color="#F6FBF9", corner_radius=10,
                         border_width=1, border_color=BORDER)
        pad = 2
        self._buttons = {}
        def _mk(text, font, fg, hover):
            return ctk.CTkButton(self, text=text, width=32, height=28, font=font,
                                 fg_color=fg, hover_color=hover, text_color="#000")
        btn_specs = [
            ("B", fonts["BOLD"], ACCENT, GREEN_DEEP),
            ("I", fonts["ITALIC"], ACCENT, GREEN_DEEP),
            ("U", fonts["UNDER"], ACCENT, GREEN_DEEP),
            ("S", fonts["STRIKE"], ACCENT, GREEN_DEEP),
            ("HL", fonts["BOLD"], "#FFE680", "#FFD24D"),
        ]
        for name, (txt, fnt, fg, hv) in zip(self.ORDER, btn_specs):
            b = _mk(txt, fnt, fg, hv); b.pack(side='left', padx=pad, pady=pad)
            self._buttons[name] = b

    def set_commands(self, cmds: dict):
        for name in self.ORDER:
            if name in cmds:
                self._buttons[name].configure(command=cmds[name])

    def show_over(self, container: ctk.CTkFrame):
        # 固定在容器右上角（不遮挡文字、不依赖容器即时宽度）
        try:
            container.update_idletasks()
        except Exception:
            pass
        self.update_idletasks()
        # 使用相对定位，保证任何宽度下都能贴紧右上角
        self.place(in_=container, relx=1.0, x=-8, y=6, anchor="ne")
        self.lift()

    def hide(self):
        self.place_forget()


# --- 卡片式待办 --------------------------------------------------------------
class TodoCard(ctk.CTkFrame):
    """一行卡片。支持：完成勾选、标题、提醒按钮、点击选中。"""
    def __init__(self, parent, app, date_ref: str, idx_ref: int, item: dict, is_projection: bool, zebra: bool):
        super().__init__(parent, corner_radius=10, border_width=1, border_color=BORDER,
                         fg_color=("#FFFFFF" if not zebra else "#FAFAFA"))
        self.app = app
        self.date_ref, self.idx_ref = date_ref, idx_ref
        self.is_projection = is_projection
        self.item = item

        self.bind("<Button-1>", self.on_select)
        # 左：完成
        self.var_done = tk.BooleanVar(value=bool(item.get('done')))
        self.chk = ctk.CTkCheckBox(self, text="", variable=self.var_done, command=self.on_toggle,
                                   state=("disabled" if is_projection or date_ref != app.cal.get_date() else "normal"))
        self.chk.pack(side='left', padx=(8,6), pady=8)
        # 中：标题（只读标签，双击进入编辑，仅对真实项）
        title = item.get('task','') + ("  (每周)" if is_projection else "")
        self.lbl = ctk.CTkLabel(self, text=title, anchor='w')
        self.lbl.pack(side='left', fill='x', expand=True, padx=6, pady=8)
        if not is_projection and date_ref == app.cal.get_date():
            self.lbl.bind('<Double-1>', self.start_edit)
        # 右：提醒时间按钮
        rtime = self._display_time()
        self.btn = ctk.CTkButton(self, text=rtime or "设置提醒", width=120,
                                 command=self.open_reminder)
        self.btn.pack(side='right', padx=8, pady=8)

    def _display_time(self):
        iso = self.item.get('reminder_time')
        if not iso:
            return ""
        try:
            dtm = dt.datetime.strptime(iso, '%Y-%m-%d %H:%M')
        except Exception:
            return ""
        # 对投影：显示当前日期的替换时间
        if self.is_projection:
            d0 = dt.datetime.strptime(self.app.cal.get_date(), '%Y-%m-%d')
            dtm = d0.replace(hour=dtm.hour, minute=dtm.minute)
        return dtm.strftime('%Y-%m-%d %H:%M')

    def on_select(self, _=None):
        self.app.active_row = (self.date_ref, self.idx_ref)
        self.configure(border_color=ACCENT)
        # 取消其他卡片的高亮
        for child in self.master.winfo_children():
            if child is not self and isinstance(child, TodoCard):
                child.configure(border_color=BORDER)

    def on_toggle(self):
        if self.is_projection or self.date_ref != self.app.cal.get_date():
            return
        self.app.data['todos'][self.date_ref][self.idx_ref]['done'] = bool(self.var_done.get())
        self.app.save_data()
        # 不重建整个列表，直接刷新本卡片文本
        self.lbl.configure(text=self.app.data['todos'][self.date_ref][self.idx_ref].get('task',''))

    def start_edit(self, _):
        if self.is_projection or self.date_ref != self.app.cal.get_date():
            return
        # 设置为选中行
        self.on_select()
        # 内联编辑：用 Tk Entry（自带简易撤销栈）替换 Label
        if hasattr(self, 'edit') and self.edit.winfo_exists():
            return
        text0 = self.app.data['todos'][self.date_ref][self.idx_ref].get('task','')
        self.lbl.pack_forget()
        self.edit = tk.Entry(self, font=("Microsoft YaHei", 11))
        self.edit.insert(0, text0)
        self.edit.pack(side='left', fill='x', expand=True, padx=6, pady=8)
        self.edit.focus_set()

        # —— 轻量撤销/重做历史 ——
        self._hist = [text0]
        self._hist_idx = 0
        def _push_state(_=None):
            cur = self.edit.get()
            if self._hist_idx < len(self._hist) - 1:
                self._hist = self._hist[:self._hist_idx+1]
            if cur != self._hist[-1]:
                self._hist.append(cur)
                self._hist_idx += 1
        def _undo(_=None):
            if self._hist_idx > 0:
                self._hist_idx -= 1
                self.edit.delete(0, 'end'); self.edit.insert(0, self._hist[self._hist_idx])
            return 'break'
        def _redo(_=None):
            if self._hist_idx < len(self._hist)-1:
                self._hist_idx += 1
                self.edit.delete(0, 'end'); self.edit.insert(0, self._hist[self._hist_idx])
            return 'break'

        # —— 完成编辑（保存/取消） ——
        def finish(save=True):
            val = self.edit.get() if save else text0
            if save:
                self.app.data['todos'][self.date_ref][self.idx_ref]['task'] = val
                self.app.save_data()
            try:
                self.edit.destroy()
            except Exception:
                pass
            self.lbl.configure(text=val)
            self.lbl.pack(side='left', fill='x', expand=True, padx=6, pady=8)

        # 绑定
        self.edit.bind('<KeyRelease>', _push_state)
        self.edit.bind('<Control-z>', _undo)
        self.edit.bind('<Control-y>', _redo)
        self.edit.bind('<Control-Shift-Z>', _redo)
        self.edit.bind('<Return>', lambda e: finish(True))
        self.edit.bind('<Escape>', lambda e: finish(False))
        self.edit.bind('<FocusOut>', lambda e: finish(True))


    def open_reminder(self):
        self.app.open_reminder_dialog_by_ref(self.date_ref, self.idx_ref)


# --- 主应用 ------------------------------------------------------------------
class ScheduleApp:
    def __init__(self, root: ctk.CTk):
        self.root = root
        self.root.title(APP_NAME)
        self.root.geometry("1280x860")
        self.root.configure(fg_color=GREEN_LIGHT)
        ctk.set_widget_scaling(1.0)

        # 字体（root 存在后创建）
        self.fonts = {
            "BOLD": ctk.CTkFont( family="Microsoft YaHei", size=12, weight="bold"),
            "ITALIC": ctk.CTkFont( family="Microsoft YaHei", size=12, slant="italic"),
            "UNDER": ctk.CTkFont( family="Microsoft YaHei", size=12, underline=1),
            "STRIKE": ctk.CTkFont( family="Microsoft YaHei", size=12, overstrike=1),
        }

        # 数据
        self.data = self.load_data()

        # 调度器
        self.scheduler = BackgroundScheduler(); self.scheduler.start()

        # UI
        self.build_ui()

        # 工具条会在 build_ui 之后、针对每个文本容器分别创建

        # 注册所有提醒
        self.register_all_jobs()

        # 关闭行为 → 最小化到托盘
        self.root.protocol("WM_DELETE_WINDOW", self.on_close_to_tray)
        self.tray_icon = None

    # ------------------------------- 数据存取 -------------------------------
    def load_data(self):
        if DATA_FILE.exists():
            try:
                data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        else:
            data = {}
        data.setdefault("schema_version", SCHEMA_VERSION)
        data.setdefault("todos", {})
        data.setdefault("goals", {})
        data.setdefault("goal_tags", {})
        data.setdefault("diary", {})
        data.setdefault("diary_tags", {})
        for date, items in data.get("todos", {}).items():
            for t in items:
                t.setdefault("done", False)
                t.setdefault("task", "")
                t.setdefault("highlighted", False)
                t.setdefault("reminder_time", None)
                t.setdefault("repeat_weekly", False)
                t.setdefault("uid", str(uuid.uuid4()))
        return data

    def save_data(self):
        try:
            DATA_FILE.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            messagebox.showerror("保存失败", str(e))

    # ------------------------------- UI 构建（Grid） -------------------------
    def build_ui(self):
        # 根窗口两列：左列**固定宽度**，右列自适应
        self.root.grid_columnconfigure(0, weight=0)  # 左列不伸展
        self.root.grid_columnconfigure(1, weight=1)  # 右列伸展
        self.root.grid_rowconfigure(0, weight=1)

        # 左侧：日历（固定宽 520）
        self.left = ctk.CTkFrame(self.root, width=520, corner_radius=16)
        self.left.grid(row=0, column=0, sticky="ns", padx=(12,6), pady=12)
        self.left.grid_propagate(False)  # 禁止跟随子控件自动伸缩

        self.cal = Calendar(self.left, selectmode='day', date_pattern='y-mm-dd')
        self.cal.pack(padx=12, pady=12, fill='both', expand=True)
        self.cal.bind("<<CalendarSelected>>", self.on_date_change)

        # 右侧：主区
        self.right = ctk.CTkFrame(self.root, corner_radius=16)
        self.right.grid(row=0, column=1, sticky="nsew", padx=(6,12), pady=12)
        self.right.grid_columnconfigure(0, weight=1)
        for r in (0,1,2,3):
            self.right.grid_rowconfigure(r, weight=1 if r>=1 else 0)

        # 顶部工具条（待办按钮）
        self.todo_bar = ctk.CTkFrame(self.right, corner_radius=12)
        self.todo_bar.grid(row=0, column=0, sticky="ew", padx=10, pady=(10,6))
        ctk.CTkLabel(self.todo_bar, text="待办事项", text_color=GREEN_DEEP).pack(side="left", padx=10)
        ctk.CTkButton(self.todo_bar, text="添加", command=self.add_todo,
                      fg_color=ACCENT, hover_color=GREEN_DEEP, width=80).pack(side="right", padx=6)
        ctk.CTkButton(self.todo_bar, text="删除", command=self.delete_todo,
                      fg_color=ACCENT, hover_color=GREEN_DEEP, width=80).pack(side="right", padx=6)

        # 待办列表（卡片式）
        self.todo_frame = ctk.CTkFrame(self.right, corner_radius=12, border_width=1, border_color=BORDER)
        self.todo_frame.grid(row=1, column=0, sticky="nsew", padx=10, pady=6)
        self.todo_scroll = ctk.CTkScrollableFrame(self.todo_frame, corner_radius=0, fg_color="#FFFFFF")
        self.todo_scroll.pack(fill='both', expand=True, padx=8, pady=8)
        self.active_row = None

        # 周目标
        self.goal_frame = ctk.CTkFrame(self.right, corner_radius=12)
        self.goal_frame.grid(row=2, column=0, sticky="nsew", padx=10, pady=6)
        ctk.CTkLabel(self.goal_frame, text="本周总体目标", text_color=GREEN_DEEP).pack(anchor='w', padx=10, pady=(10,4))
        self.goal_text = tk.Text(self.goal_frame, wrap='word', height=8, borderwidth=0,
                                   font=("Microsoft YaHei", 11), undo=True, autoseparators=True, maxundo=-1)
        self.goal_text.pack(side='left', fill='both', expand=True, padx=(10,0), pady=(0,10))
        self.goal_sb = ctk.CTkScrollbar(self.goal_frame, command=self.goal_text.yview)
        self.goal_sb.pack(side='right', fill='y', padx=(0,10), pady=(0,10))
        self.goal_text.configure(yscrollcommand=self.goal_sb.set)
        self.init_text_tags(self.goal_text)
        # 文本输入实时保存（修复你说的“编辑不落盘”）
        self.goal_text.bind('<KeyRelease>', self.save_goal, add='+')
        self.goal_text.bind('<FocusOut>', self.save_goal, add='+')

        # 日记
        self.diary_frame = ctk.CTkFrame(self.right, corner_radius=12)
        self.diary_frame.grid(row=3, column=0, sticky="nsew", padx=10, pady=(6,10))
        ctk.CTkLabel(self.diary_frame, text="今日日记", text_color=GREEN_DEEP).pack(anchor='w', padx=10, pady=(10,4))
        self.diary_text = tk.Text(self.diary_frame, wrap='word', height=10, borderwidth=0,
                                    font=("Microsoft YaHei", 11), undo=True, autoseparators=True, maxundo=-1)
        self.diary_text.pack(side='left', fill='both', expand=True, padx=(10,0), pady=(0,10))
        self.diary_sb = ctk.CTkScrollbar(self.diary_frame, command=self.diary_text.yview)
        self.diary_sb.pack(side='right', fill='y', padx=(0,10), pady=(0,10))
        self.diary_text.configure(yscrollcommand=self.diary_sb.set)
        self.init_text_tags(self.diary_text)
        # 文本输入实时保存（修复你说的“编辑不落盘”）
        self.diary_text.bind('<KeyRelease>', self.save_diary, add='+')
        self.diary_text.bind('<FocusOut>', self.save_diary, add='+')

        # —— 内嵌工具条（每个文本一个） ——
        self.goal_toolbar = InlineToolbar(self.goal_frame, self.fonts)
        self.diary_toolbar = InlineToolbar(self.diary_frame, self.fonts)
        self.goal_toolbar.hide(); self.diary_toolbar.hide()

        # 文本事件：保存/显示工具条（200ms 防抖）
        self._after_id = {}
        for t in (self.goal_text, self.diary_text):
            t.bind('<<Selection>>', lambda e: self._debounced_show_toolbar(e.widget), add='+')
            t.bind('<KeyRelease>', lambda e: self._debounced_show_toolbar(e.widget), add='+')
            t.bind('<ButtonRelease-1>', lambda e: self._debounced_show_toolbar(e.widget), add='+')

        # 初始化当天视图
        self.update_all_views()

        # Text 专用的撤销/重做绑定，避免与默认行为叠加
        for w in (self.goal_text, self.diary_text):
            w.bind('<Control-z>', lambda e, t=w: (t.edit_undo(), 'break'))
            w.bind('<Control-y>', lambda e, t=w: (t.edit_redo(), 'break'))
            w.bind('<Control-Shift-Z>', lambda e, t=w: (t.edit_redo(), 'break'))

    # ------------------------------- 文本 tag --------------------------------
    def init_text_tags(self, t: tk.Text):
        t.tag_configure("b", font=("Microsoft YaHei", 11, "bold"))
        t.tag_configure("i", font=("Microsoft YaHei", 11, "italic"))
        t.tag_configure("u", underline=True)
        t.tag_configure("s", overstrike=True)
        t.tag_configure("hl", background=HL_BG, foreground=HL_FG)

    def toggle_tag(self, t: tk.Text, tag: str):
        try:
            start, end = t.index('sel.first'), t.index('sel.last')
        except tk.TclError:
            return
        if t.tag_nextrange(tag, start, end):
            t.tag_remove(tag, start, end)
        else:
            t.tag_add(tag, start, end)

    def _debounced_show_toolbar(self, t: tk.Text):
        def cb():
            # 若没有选区，隐藏对应工具条
            try:
                t.index('sel.first'); t.index('sel.last')
            except tk.TclError:
                (self.goal_toolbar if t is self.goal_text else self.diary_toolbar).hide()
                return
            # 有选区：绑定命令到当前文本并显示
            toolbar = self.goal_toolbar if t is self.goal_text else self.diary_toolbar
            toolbar.set_commands({
                'b': lambda: (self.toggle_tag(t, 'b'), self.persist_rich_text(t)),
                'i': lambda: (self.toggle_tag(t, 'i'), self.persist_rich_text(t)),
                'u': lambda: (self.toggle_tag(t, 'u'), self.persist_rich_text(t)),
                's': lambda: (self.toggle_tag(t, 's'), self.persist_rich_text(t)),
                'hl': lambda: (self.toggle_tag(t, 'hl'), self.persist_rich_text(t)),
            })
            container = self.goal_frame if t is self.goal_text else self.diary_frame
            toolbar.show_over(container)
        old = self._after_id.get(t)
        if old:
            try: self.root.after_cancel(old)
            except Exception: pass
        self._after_id[t] = self.root.after(120, cb)

    def persist_rich_text(self, t: tk.Text):
        selected_date = self.cal.get_date()
        ws = week_start(selected_date)
        tag_store = {}
        for tag in ("b","i","u","s","hl"):
            ranges = t.tag_ranges(tag)
            lst = []
            for i in range(0, len(ranges), 2):
                lst.append((str(ranges[i]), str(ranges[i+1])))
            tag_store[tag] = lst
        if t is self.goal_text:
            self.data['goal_tags'][ws] = tag_store
            self.data['goals'][ws] = self.goal_text.get('1.0','end-1c')
        else:
            self.data['diary_tags'][selected_date] = tag_store
            self.data['diary'][selected_date] = self.diary_text.get('1.0','end-1c')
        self.save_data()

    # ------------------------ 日期切换 & 视图刷新 ----------------------------
    def on_date_change(self, _):
        self.update_all_views()

    def update_all_views(self):
        selected_date = self.cal.get_date()
        ws = week_start(selected_date)

        # --- 渲染卡片列表 ---
        for w in list(self.todo_scroll.winfo_children()):
            w.destroy()
        base = self.data['todos'].get(selected_date, [])
        for i, titem in enumerate(base):
            card = TodoCard(self.todo_scroll, self, selected_date, i, titem, False, zebra=bool(i%2))
            card.pack(fill='x', padx=2, pady=4)
        # 追加投影
        target_dow = dt.datetime.strptime(selected_date, "%Y-%m-%d").weekday()
        proj_count = 0
        for d, items in self.data['todos'].items():
            if d == selected_date:
                continue
            for j, titem in enumerate(items):
                if titem.get('repeat_weekly') and titem.get('reminder_time'):
                    base_dt = dt.datetime.strptime(titem['reminder_time'], '%Y-%m-%d %H:%M')
                    if base_dt.weekday() == target_dow:
                        card = TodoCard(self.todo_scroll, self, d, j, titem, True, zebra=bool((len(base)+proj_count)%2))
                        card.pack(fill='x', padx=2, pady=4)
                        proj_count += 1

        # --- 周目标 ---
        self.goal_text.delete('1.0','end')
        self.goal_text.insert('1.0', self.data['goals'].get(ws, ''))
        for tag in ("b","i","u","s","hl"):
            self.goal_text.tag_remove(tag,'1.0','end')
        for tag, ranges in self.data['goal_tags'].get(ws, {}).items():
            for s,e in ranges:
                try:
                    self.goal_text.tag_add(tag, s, e)
                except tk.TclError:
                    pass
        # 重置撤销栈基线：避免 Ctrl+Z 把整段加载文本撤掉
        try:
            self.goal_text.edit_reset()
        except Exception:
            pass

        # --- 日记 ---
        self.diary_text.delete('1.0','end')
        self.diary_text.insert('1.0', self.data['diary'].get(selected_date, ''))
        for tag in ("b","i","u","s","hl"):
            self.diary_text.tag_remove(tag,'1.0','end')
        for tag, ranges in self.data['diary_tags'].get(selected_date, {}).items():
            for s,e in ranges:
                try:
                    self.diary_text.tag_add(tag, s, e)
                except tk.TclError:
                    pass
        try:
            self.diary_text.edit_reset()
        except Exception:
            pass

        # ------------------------------- 待办交互 -------------------------------
    def add_todo(self):
        date = self.cal.get_date()
        self.data['todos'].setdefault(date, [])
        self.data['todos'][date].append({
            'done': False,
            'task': '',
            'highlighted': False,
            'reminder_time': None,
            'repeat_weekly': False,
            'uid': str(uuid.uuid4()),
        })
        self.save_data(); self.update_all_views()

    def delete_todo(self):
        # 从活动行（点击卡片后）删除
        if not self.active_row:
            messagebox.showinfo("提示", "请先点击要删除的卡片以选中它。")
            return
        date_ref, idx_ref = self.active_row
        try:
            todo = self.data['todos'][date_ref][idx_ref]
        except Exception:
            return
        if todo.get('repeat_weekly'):
            ok = messagebox.askokcancel("删除每周重复事项", "该事项为每周重复提醒，将清空之后所有提醒，确定要删除？")
            if not ok:
                return
        try:
            self.scheduler.remove_job(todo.get('uid'))
        except Exception:
            pass
        try:
            self.data['todos'][date_ref].pop(idx_ref)
        except Exception:
            pass
        self.active_row = None
        self.save_data(); self.update_all_views()

    def on_todo_double(self, event):
        pass  # 卡片模式下不用 Treeview 双击

    def inline_edit_task(self, item_id):
        return  # 卡片模式下改在 TodoCard.start_edit 中处理

    def on_tree_click(self, event):
        pass  # 卡片模式下无 Treeview 点击事件

    # ------------------------------- 提醒相关 -------------------------------
    def open_reminder_dialog_by_ref(self, date_ref: str, idx_ref: int):
        d = ctk.CTkToplevel(self.root)
        d.title("设置提醒"); d.geometry("340x230")
        # 置顶到主窗口之上
        try:
            d.transient(self.root)
            d.grab_set()
            d.lift()
            d.attributes('-topmost', True)
            d.focus_force()
        except Exception:
            pass
        # 居中到主窗口
        self.root.update_idletasks(); d.update_idletasks()
        rx, ry = self.root.winfo_rootx(), self.root.winfo_rooty()
        rw, rh = self.root.winfo_width(), self.root.winfo_height()
        dw, dh = 340, 230
        d.geometry(f"{dw}x{dh}+{rx + (rw-dw)//2}+{ry + (rh-dh)//2}")

        ctk.CTkLabel(d, text="日期").pack(pady=(12,2))
        de = DateEntry(d, date_pattern="yyyy-mm-dd"); de.pack(pady=4)

        ctk.CTkLabel(d, text="时间").pack(pady=(8,2))
        hours = [f"{h:02d}" for h in range(24)]
        minutes = [f"{m:02d}" for m in range(0,60,5)]
        hv = tk.StringVar(value="09"); mv = tk.StringVar(value="00")
        row = ctk.CTkFrame(d); row.pack(pady=4)
        hr = ctk.CTkComboBox(row, values=hours, variable=hv, width=80)
        mn = ctk.CTkComboBox(row, values=minutes, variable=mv, width=80)
        hr.pack(side='left', padx=8); mn.pack(side='left', padx=8)

        todo = self.data['todos'][date_ref][idx_ref]
        if todo.get('reminder_time'):
            base_dt = dt.datetime.strptime(todo['reminder_time'], '%Y-%m-%d %H:%M')
            de.set_date(base_dt.date())
            hv.set(f"{base_dt.hour:02d}"); mv.set(f"{(base_dt.minute//5)*5:02d}")
        else:
            de.set_date(dt.datetime.now().date())
        rep = tk.BooleanVar(value=bool(todo.get('repeat_weekly')))
        chk = ctk.CTkCheckBox(d, text="每周重复", variable=rep); chk.pack(pady=10)

        def save():
            date_str = de.get_date().strftime('%Y-%m-%d')
            iso = f"{date_str} {hv.get()}:{mv.get()}"
            todo['reminder_time'] = iso
            todo['repeat_weekly'] = bool(rep.get())
            self.schedule_reminder(todo)
            self.save_data(); self.update_all_views(); d.destroy()
        ctk.CTkButton(d, text="保存", command=save, fg_color=ACCENT, hover_color=GREEN_DEEP).pack(pady=12)
        d.bind('<Escape>', lambda e: d.destroy())

    def register_all_jobs(self):
        for job in list(self.scheduler.get_jobs()):
            try: self.scheduler.remove_job(job.id)
            except Exception: pass
        for _, items in self.data['todos'].items():
            for it in items:
                self.schedule_reminder(it)

    def schedule_reminder(self, todo: dict):
        uid = todo.get('uid') or str(uuid.uuid4()); todo['uid'] = uid
        try: self.scheduler.remove_job(uid)
        except Exception: pass
        iso = todo.get('reminder_time');
        if not iso: return
        try:
            when = dt.datetime.strptime(iso, '%Y-%m-%d %H:%M') - dt.timedelta(minutes=5)
        except Exception:
            return
        if todo.get('repeat_weekly'):
            dow = when.weekday(); trig = CronTrigger(day_of_week=dow, hour=when.hour, minute=when.minute)
        else:
            if when <= dt.datetime.now(): return
            trig = DateTrigger(run_date=when)
        self.scheduler.add_job(lambda: self.fire_notify(todo), trigger=trig, id=uid, replace_existing=True)

    def fire_notify(self, todo: dict):
        title = "待办提醒"; message = todo.get('task','') or '您有待办任务即将开始'
        if WIN_TOAST:
            try:
                WIN_TOAST.show_toast(title, message, duration=8, threaded=True); return
            except Exception:
                pass
        try:
            notification.notify(title=title, message=message, timeout=8); return
        except Exception:
            pass
        self.inapp_toast(title, message)

    def inapp_toast(self, title: str, msg: str):
        toast = ctk.CTkToplevel(self.root); toast.overrideredirect(True); toast.attributes('-topmost', True)
        toast.configure(corner_radius=12)
        ctk.CTkLabel(toast, text=title, text_color=GREEN_DEEP).pack(padx=12, pady=(10,4))
        ctk.CTkLabel(toast, text=msg, wraplength=240).pack(padx=12, pady=(0,10))
        w, h = 280, 120; sw = self.root.winfo_screenwidth(); sh = self.root.winfo_screenheight()
        toast.geometry(f"{w}x{h}+{sw - w - 20}+{sh - h - 60}")
        toast.after(5000, lambda: toast.destroy() if toast.winfo_exists() else None)

    # ------------------------------- 目标/日记保存 ---------------------------
    def save_goal(self, _=None):
        ds = self.cal.get_date(); ws = week_start(ds)
        self.data['goals'][ws] = self.goal_text.get('1.0','end-1c')
        self.persist_rich_text(self.goal_text)

    def save_diary(self, _=None):
        ds = self.cal.get_date()
        self.data['diary'][ds] = self.diary_text.get('1.0','end-1c')
        self.persist_rich_text(self.diary_text)

    # ------------------------------- 托盘相关 --------------------------------
    def on_close_to_tray(self):
        self.root.withdraw()
        if getattr(self, 'tray_icon', None) is None:
            self.start_tray()

    def start_tray(self):
        def _create_icon():
            img = Image.new('RGBA', (64,64), (0,0,0,0))
            d = ImageDraw.Draw(img)
            d.ellipse((6,6,58,58), fill=(47,94,73,255))
            d.ellipse((18,22,46,50), fill=(221,236,227,255))
            return img
        image = _create_icon()

        def on_show(icon, item):
            self.root.after(0, self.restore_from_tray)
        def on_quit(icon, item):
            self.scheduler.shutdown(wait=False)
            icon.visible = False; icon.stop(); self.tray_icon = None
            self.root.after(0, self.root.destroy)

        menu = pystray.Menu(pystray.MenuItem('显示', on_show), pystray.MenuItem('退出', on_quit))
        self.tray_icon = pystray.Icon(APP_NAME, image, APP_NAME, menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def restore_from_tray(self):
        try:
            self.root.deiconify(); self.root.after(100, self.root.lift)
        except Exception: pass


# --- 启动 --------------------------------------------------------------------
if __name__ == "__main__":
    root = ctk.CTk()
    app = ScheduleApp(root)
    root.mainloop()
