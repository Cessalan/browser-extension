import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToHtml, markdownToPlain } from './format';

const text = (t: string, ...marks: string[]) => ({ type: 'text', text: t, marks: marks.map((type) => ({ type })) });
const p = (...content: object[]) => ({ type: 'paragraph', content });

describe('docToMarkdown', () => {
  it('serializes marks, lists and line breaks', () => {
    const doc = {
      type: 'doc',
      content: [
        p(text('Hi '), text('Dr. Patel', 'bold'), text(',')),
        p(text('Please '), text('sign today ', 'highlight'), text('and '), text('call', 'underline'), text(' the '), text('family', 'italic'), text('.')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('Orders'))] }, { type: 'listItem', content: [p(text('Transport'))] }] },
        { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [p(text('First'))] }] },
        p(text('Thanks,'), { type: 'hardBreak' }, text('Jordan')),
      ],
    };
    expect(docToMarkdown(doc)).toBe(
      'Hi **Dr. Patel**,\n\nPlease ==sign today== and <u>call</u> the *family*.\n\n- Orders\n- Transport\n\n1. First\n\nThanks,\nJordan',
    );
  });

  it('escapes literal asterisks', () => {
    expect(docToMarkdown({ type: 'doc', content: [p(text('Room 5*'))] })).toBe('Room 5\\*');
  });
});

describe('markdownToHtml', () => {
  it('renders formatting the editor understands', () => {
    const html = markdownToHtml('Hi **Dr. Patel**, ==sign== <u>today</u>.\n\n- Orders\n\nThanks,\nJordan');
    expect(html).toContain('<strong>Dr. Patel</strong>');
    expect(html).toContain('<mark>sign</mark>');
    expect(html).toContain('<u>today</u>');
    expect(html).toContain('<li>Orders</li>');
    expect(html).toContain('Thanks,<br>Jordan');
  });
});

describe('markdownToPlain', () => {
  it('drops markers but keeps the words and bullets', () => {
    expect(markdownToPlain('Hi **Dr. Patel**, ==sign== <u>today</u> *now*.\n- Orders\n1. One\nRoom 5\\*')).toBe(
      'Hi Dr. Patel, sign today now.\n• Orders\n1. One\nRoom 5*',
    );
  });
});
