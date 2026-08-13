import { useEffect, useRef } from 'react'
import { Bold, Highlighter, Italic, Redo2, Star, Strikethrough, Underline, Undo2 } from 'lucide-react'

interface Props {
  label: string
  eyebrow: string
  html: string
  placeholder: string
  onChange: (html: string) => void
  highlighted?: boolean
  onToggleHighlight?: () => void
}

export function RichEditor({ label, eyebrow, html, placeholder, onChange, highlighted = false, onToggleHighlight }: Props) {
  const editor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html
  }, [html])

  const command = (name: string, value?: string) => {
    editor.current?.focus()
    document.execCommand(name, false, value)
    if (editor.current) onChange(editor.current.innerHTML)
  }

  return <section className="editor-card">
    <header className="editor-heading">
      <div className="editor-title-block">
        <span className="eyebrow">{eyebrow}</span>
        <div className="editor-title-row">
          <h2>{label}</h2>
          {onToggleHighlight && <button
            className={`diary-star-button ${highlighted ? 'active' : ''}`}
            onClick={onToggleHighlight}
            aria-label={highlighted ? '取消重点日记' : '标为重点日记'}
            title={highlighted ? '取消重点日记' : '标为重点日记'}
          ><Star /></button>}
        </div>
      </div>
      <div className="format-toolbar" aria-label={`${label}格式工具`}>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('undo')} title="撤销"><Undo2 /></button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('redo')} title="重做"><Redo2 /></button>
        <i />
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('bold')} title="加粗"><Bold /></button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('italic')} title="斜体"><Italic /></button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('underline')} title="下划线"><Underline /></button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('strikeThrough')} title="删除线"><Strikethrough /></button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => command('hiliteColor', '#f8df8b')} title="高亮"><Highlighter /></button>
      </div>
    </header>
    <div
      ref={editor}
      className="rich-editor"
      contentEditable
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      suppressContentEditableWarning
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
    />
  </section>
}
