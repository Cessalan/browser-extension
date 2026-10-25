import { marked } from 'marked';
import type { JSONContent } from '@tiptap/core';

/**
 * The editor holds rich text; the AI reads and writes Markdown. These helpers convert between them.
 * Supported: **bold**, *italic*, <u>underline</u>, ==highlight==, [links](url), bullet and numbered lists,
 * paragraphs (blank line) and line breaks (single newline).
 */

const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/==/g, '\\=\\=');

function inline(nodes: JSONContent[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\n';
      if (node.type !== 'text' || !node.text) return '';
      let out = escapeText(node.text);
      // Keep spaces outside the markers: "** bold **" is not bold in Markdown.
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(out)!;
      if (!core) return out;
      out = core;
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') out = `**${out}**`;
        else if (mark.type === 'italic') out = `*${out}*`;
        else if (mark.type === 'underline') out = `<u>${out}</u>`;
        else if (mark.type === 'highlight') out = `==${out}==`;
        else if (mark.type === 'link' && mark.attrs?.href) out = `[${out}](${mark.attrs.href})`;
      }
      return lead + out + trail;
    })
    .join('');
}

function block(node: JSONContent, indent = ''): string {
  switch (node.type) {
    case 'paragraph':
      return indent + inline(node.content).replace(/\n/g, `\n${indent}`);
    case 'bulletList':
    case 'orderedList': {
      const start = (node.attrs?.start as number | undefined) ?? 1;
      return (node.content ?? [])
        .map((item, i) => {
          const marker = node.type === 'bulletList' ? '- ' : `${start + i}. `;
          const [first, ...rest] = item.content ?? [];
          const head = first ? block(first).trimStart() : '';
          const tail = rest.map((child) => block(child, indent + '   ')).join('\n');
          return indent + marker + head + (tail ? `\n${tail}` : '');
        })
        .join('\n');
    }
    default:
      return inline(node.content);
  }
}

export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((node) => block(node))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function markdownToHtml(md: string): string {
  // ==highlight== is not standard Markdown; turn it into <mark> before parsing.
  const withMarks = md.replace(/(?<!\\)==(?=\S)([^=\n]+?)(?<=\S)==/g, '<mark>$1</mark>');
  return marked.parse(withMarks, { breaks: true, gfm: true, async: false });
}

/** Readable plain text, used for word counts, privacy checks and the side-by-side comparison. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<\/?u>/g, '')
    .replace(/(?<!\\)\*\*(.+?)(?<!\\)\*\*/g, '$1')
    .replace(/(?<!\\)\*(?!\s)(.+?)(?<!\\)\*/g, '$1')
    .replace(/(?<!\\)==(.+?)(?<!\\)==/g, '$1')
    .replace(/\\([\\*=])/g, '$1');
}
