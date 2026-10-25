import { useEffect, useReducer, useRef } from 'preact/hooks';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Highlighter, Italic, List, ListOrdered, RemoveFormatting, Underline, type LucideIcon } from 'lucide-preact';
import { useI18n, type Key } from '../i18n';
import { docToMarkdown, markdownToHtml } from './format';

/** Rich text editor for emails: bold, italic, underline, highlight, lists and links. Reports Markdown. */
export function RichEditor({
  initialMarkdown = '',
  placeholder,
  onChange,
  onReady,
  onSubmit,
  autofocus,
  class: className = '',
}: {
  initialMarkdown?: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onReady?: (editor: Editor | null) => void;
  /** Ctrl/Cmd + Enter. */
  onSubmit?: () => void;
  autofocus?: boolean;
  class?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks without recreating the editor.
  const callbacks = useRef({ onChange, onSubmit });
  callbacks.current = { onChange, onSubmit };

  useEffect(() => {
    const editor = new Editor({
      element: host.current!,
      content: initialMarkdown ? markdownToHtml(initialMarkdown) : '',
      autofocus: autofocus ? 'end' : false,
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          code: false,
          blockquote: false,
          horizontalRule: false,
          strike: false,
          link: { openOnClick: false, autolink: true },
        }),
        Highlight,
        Placeholder.configure({ placeholder: placeholder ?? '' }),
      ],
      editorProps: {
        attributes: { class: `confi-editor outline-none ${className}`, spellcheck: 'true' },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && callbacks.current.onSubmit) {
            callbacks.current.onSubmit();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => callbacks.current.onChange(docToMarkdown(editor.getJSON())),
    });
    onReady?.(editor);
    return () => {
      onReady?.(null);
      editor.destroy();
    };
  }, []);

  return <div ref={host} />;
}

const FORMATS: { key: Key; icon: LucideIcon; active: string; run: (e: Editor) => void; shortcut?: string }[] = [
  { key: 'format.bold', icon: Bold, active: 'bold', run: (e) => e.chain().focus().toggleBold().run(), shortcut: 'Ctrl+B' },
  { key: 'format.italic', icon: Italic, active: 'italic', run: (e) => e.chain().focus().toggleItalic().run(), shortcut: 'Ctrl+I' },
  { key: 'format.underline', icon: Underline, active: 'underline', run: (e) => e.chain().focus().toggleUnderline().run(), shortcut: 'Ctrl+U' },
  { key: 'format.highlight', icon: Highlighter, active: 'highlight', run: (e) => e.chain().focus().toggleHighlight().run() },
  { key: 'format.bullets', icon: List, active: 'bulletList', run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'format.numbers', icon: ListOrdered, active: 'orderedList', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'format.clear', icon: RemoveFormatting, active: '', run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run() },
];

/** Formatting buttons; they light up to show what's applied at the cursor. */
export function FormatBar({ editor }: { editor: Editor | null }) {
  const { t } = useI18n();
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', rerender);
    return () => void editor.off('transaction', rerender);
  }, [editor]);

  return (
    <div class="flex items-center gap-0.5" role="toolbar" aria-label={t('format.toolbar')}>
      {FORMATS.map(({ key, icon: Icon, active, run, shortcut }, i) => {
        const on = !!editor && !!active && editor.isActive(active);
        const label = shortcut ? `${t(key)} (${shortcut})` : t(key);
        return (
          <>
            {i === 4 || i === 6 ? <span class="mx-1 h-5 w-px bg-line" aria-hidden="true" /> : null}
            <button
              type="button"
              class={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
                on ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
              title={label}
              aria-label={label}
              aria-pressed={active ? on : undefined}
              disabled={!editor}
              // Keep the text selection: don't let the button take focus on mousedown.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor && run(editor)}
            >
              <Icon size={16} />
            </button>
          </>
        );
      })}
    </div>
  );
}

/** Selects the first occurrence of `text` in the editor (used to show a flagged detail). */
export function selectText(editor: Editor, text: string) {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range || !node.isText) return !range;
    const i = node.text!.indexOf(text);
    if (i >= 0) range = { from: pos + i, to: pos + i + text.length };
    return false;
  });
  const chain = editor.chain().focus();
  if (range) chain.setTextSelection(range).scrollIntoView();
  chain.run();
}
