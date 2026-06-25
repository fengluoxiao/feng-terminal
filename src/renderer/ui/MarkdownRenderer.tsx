import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Play } from 'lucide-react';
import type { ConversationFileReference, ConversationReference } from '../../shared/conversation';

export type MarkdownReferenceClass = 'file' | 'context';

export interface MarkdownReferenceLabel {
  label: string;
  className: MarkdownReferenceClass;
}

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

export interface TerminalPreview {
  status: 'queued' | 'sent' | 'running' | 'warning' | 'failed' | 'completed' | 'skipped';
  target: string;
  cwd: string;
  command: string;
  output?: string;
}

export interface MarkdownRendererLabels {
  terminal: string;
  preview: {
    cwd: string;
    cmd: string;
    output: string;
    statuses: Record<TerminalPreview['status'], string>;
  };
}

export function getMessageReferenceLabels(
  fileReferences?: ConversationFileReference[],
  references?: ConversationReference[]
): MarkdownReferenceLabel[] {
  return [
    ...(fileReferences ?? []).map((item) => ({ label: `@${item.name}`, className: 'file' as const })),
    ...(references ?? []).flatMap((item) => [
      { label: `#${item.title}`, className: 'context' as const },
      ...(/(?:终端|terminal|shell|对话|conversation)$/iu.test(item.title)
        ? [{ label: item.title, className: 'context' as const }]
        : [])
    ])
  ]
    .filter((item) => item.label.length > 1)
    .sort((left, right) => right.label.length - left.label.length);
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const normalizedMarkdown = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\s+(\|(?:\s*:?-{3,}:?\s*\|)+)/gu, '\n$1')
    .replace(/(\|(?:\s*:?-{3,}:?\s*\|)+)\s+(?=\|)/gu, '$1\n');
  const lines = normalizedMarkdown.split('\n');
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] | null = null;
  let codeLanguage: string | undefined;

  function flushParagraph(): void {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join('\n').trim() });
    paragraph = [];
  }

  function flushList(): void {
    if (!listItems.length) return;
    blocks.push({ type: 'list', items: listItems });
    listItems = [];
  }

  function splitTableRow(line: string): string[] {
    return line
      .trim()
      .replace(/^\|/u, '')
      .replace(/\|$/u, '')
      .split('|')
      .map((cell) => cell.trim());
  }

  function isTableSeparator(line: string): boolean {
    const cells = splitTableRow(line);
    return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fence = /^```([a-z0-9_-]*)\s*$/iu.exec(line.trim());
    if (fence) {
      if (codeLines) {
        blocks.push({ type: 'code', text: codeLines.join('\n'), language: codeLanguage });
        codeLines = null;
        codeLanguage = undefined;
        continue;
      }

      flushParagraph();
      flushList();
      codeLines = [];
      codeLanguage = fence[1] || undefined;
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    if (line.includes('|') && isTableSeparator(lines[lineIndex + 1] ?? '')) {
      flushParagraph();
      flushList();
      const headers = splitTableRow(line);
      lineIndex += 2;
      const rows: string[][] = [];
      while (lineIndex < lines.length && lines[lineIndex].includes('|') && lines[lineIndex].trim()) {
        const cells = splitTableRow(lines[lineIndex]);
        rows.push(cells.slice(0, headers.length));
        lineIndex += 1;
      }
      lineIndex -= 1;
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const listMatch = /^\s*[-*]\s+(.+)$/u.exec(line);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (codeLines) blocks.push({ type: 'code', text: codeLines.join('\n'), language: codeLanguage });
  flushParagraph();
  flushList();

  return blocks;
}

function renderReferenceHighlights(text: string, references: MarkdownReferenceLabel[] = []): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < text.length) {
    const match = references
      .map((item) => ({ ...item, index: text.indexOf(item.label, index) }))
      .filter((item) => item.index >= 0)
      .sort((left, right) => left.index - right.index || right.label.length - left.label.length)[0];

    if (!match) {
      nodes.push(text.slice(index));
      break;
    }

    if (match.index > index) nodes.push(text.slice(index, match.index));
    nodes.push(
      <span className={`agent-highlight-reference ${match.className}`} key={`${match.label}-${match.index}`}>
        {match.label}
      </span>
    );
    index = match.index + match.label.length;
  }

  return nodes.length ? nodes : [text];
}

function renderInlineMarkdown(text: string, references?: MarkdownReferenceLabel[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*\n][\s\S]*?\*\*|__[^_\n][\s\S]*?__|~~[^~\n][\s\S]*?~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<)]+)/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(...renderReferenceHighlights(text.slice(cursor, match.index), references));
    }

    const value = match[0];
    const key = `${match.index}-${value}`;
    const linkMatch = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/u.exec(value);
    if (value.startsWith('`') && value.endsWith('`')) {
      nodes.push(<code key={key}>{renderReferenceHighlights(value.slice(1, -1), references)}</code>);
    } else if (linkMatch) {
      nodes.push(
        <a href={linkMatch[2]} key={key} rel="noreferrer" target="_blank" title={linkMatch[2]}>
          {renderInlineMarkdown(linkMatch[1], references)}
        </a>
      );
    } else if (/^https?:\/\//iu.test(value)) {
      nodes.push(
        <a href={value} key={key} rel="noreferrer" target="_blank" title={value}>
          {value}
        </a>
      );
    } else if (
      (value.startsWith('**') && value.endsWith('**')) ||
      (value.startsWith('__') && value.endsWith('__'))
    ) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(value.slice(2, -2), references)}</strong>);
    } else if (value.startsWith('~~') && value.endsWith('~~')) {
      nodes.push(<del key={key}>{renderInlineMarkdown(value.slice(2, -2), references)}</del>);
    } else if (
      (value.startsWith('*') && value.endsWith('*')) ||
      (value.startsWith('_') && value.endsWith('_'))
    ) {
      nodes.push(<em key={key}>{renderInlineMarkdown(value.slice(1, -1), references)}</em>);
    } else {
      nodes.push(...renderReferenceHighlights(value, references));
    }
    cursor = match.index + value.length;
  }

  if (cursor < text.length) nodes.push(...renderReferenceHighlights(text.slice(cursor), references));
  return nodes;
}

function parseTerminalPreview(text: string): TerminalPreview | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const fields: Record<string, string> = {};
  let multilineKey: string | null = null;

  for (const line of lines) {
    const multilineMatch = /^([a-z]+):\s*\|\s*$/iu.exec(line);
    if (multilineMatch) {
      multilineKey = multilineMatch[1].toLowerCase();
      fields[multilineKey] = '';
      continue;
    }

    const fieldMatch = /^([a-z]+):\s*(.*)$/iu.exec(line);
    if (fieldMatch && !line.startsWith('  ')) {
      multilineKey = null;
      fields[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim();
      continue;
    }

    if (multilineKey) {
      const value = line.startsWith('  ') ? line.slice(2) : line;
      fields[multilineKey] = fields[multilineKey] ? `${fields[multilineKey]}\n${value}` : value;
    }
  }

  const status = fields.status as TerminalPreview['status'];
  if (!['queued', 'sent', 'running', 'warning', 'failed', 'completed', 'skipped'].includes(status)) return null;
  if (!fields.command) return null;

  return {
    status,
    target: fields.target || '',
    cwd: fields.cwd || '',
    command: fields.command,
    output: fields.output
  };
}

function renderTerminalSyntax(text: string, mode: 'command' | 'output'): ReactNode[] {
  const pattern =
    /(\$env:[A-Z0-9_]+|https?:\/\/[^\s]+|(?:[A-Z]:\\|\.{1,2}[\\/]|\/)[^\s;'"`]+|`[^`]+`|\b(?:Set-Location|node|npm|pnpm|yarn|bun|cd)\b|\b(?:error|warn|warning|failed|fatal|MODULE_NOT_FOUND|ENOENT|EADDRINUSE)\b|\b(?:Listening|Starting|Loaded|started successfully|ready)\b)/giu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const value = match[0];
    const className =
      /^\$env:/iu.test(value)
        ? 'env'
        : /^https?:/iu.test(value)
          ? 'url'
          : /^(?:[A-Z]:\\|\.{1,2}[\\/]|\/)/iu.test(value)
            ? 'path'
            : /^`/u.test(value)
              ? 'inline'
              : /\b(?:error|warn|warning|failed|fatal|MODULE_NOT_FOUND|ENOENT|EADDRINUSE)\b/iu.test(value)
                ? 'error'
                : /\b(?:Listening|Starting|Loaded|started successfully|ready)\b/iu.test(value)
                  ? 'success'
                  : 'command';
    nodes.push(
      <span className={`terminal-syntax ${mode} ${className}`} key={`${match.index}-${value}`}>
        {value}
      </span>
    );
    cursor = match.index + value.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function TerminalPreviewCard({
  preview,
  labels
}: {
  preview: TerminalPreview;
  labels: MarkdownRendererLabels;
}): ReactNode {
  const isFailed = preview.status === 'failed' || preview.status === 'skipped';
  const isDone = preview.status === 'completed';
  const Icon = isFailed ? CircleAlert : isDone ? CircleCheck : preview.status === 'running' ? LoaderCircle : Play;

  return (
    <section className={`terminal-preview-card ${preview.status}`}>
      <header>
        <span className="terminal-preview-icon">
          <Icon size={14} />
        </span>
        <strong>{preview.target || labels.terminal}</strong>
        <em>{labels.preview.statuses[preview.status]}</em>
      </header>
      {preview.cwd ? (
        <div className="terminal-preview-row">
          <span>{labels.preview.cwd}</span>
          <code>{preview.cwd}</code>
        </div>
      ) : null}
      <div className="terminal-preview-row">
        <span>{labels.preview.cmd}</span>
        <pre>{renderTerminalSyntax(preview.command, 'command')}</pre>
      </div>
      {preview.output ? (
        <details className="terminal-preview-output" open={isFailed}>
          <summary>{labels.preview.output}</summary>
          <pre>{renderTerminalSyntax(preview.output, 'output')}</pre>
        </details>
      ) : null}
    </section>
  );
}

export function MarkdownMessage({
  content,
  className,
  references,
  labels
}: {
  content: string;
  className?: string;
  references?: MarkdownReferenceLabel[];
  labels: MarkdownRendererLabels;
}): ReactNode {
  const blocks = parseMarkdownBlocks(content);
  if (!blocks.length) return <p className={className} />;

  return (
    <div className={className ? `agent-message-markdown ${className}` : 'agent-message-markdown'}>
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          const terminalPreview = block.language === 'terminal-preview' ? parseTerminalPreview(block.text) : null;
          if (terminalPreview) return <TerminalPreviewCard key={index} preview={terminalPreview} labels={labels} />;

          return (
            <pre key={index}>
              {block.language ? <span>{block.language}</span> : null}
              <code>{block.text}</code>
            </pre>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item, references)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'table') {
          return (
            <div className="agent-message-table-wrap" key={index}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={headerIndex}>{renderInlineMarkdown(header, references)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.headers.map((_, cellIndex) => (
                        <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] ?? '', references)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={index}>{renderInlineMarkdown(block.text, references)}</p>;
      })}
    </div>
  );
}

export function PlainMarkdownLine({
  content,
  references
}: {
  content: string;
  references?: MarkdownReferenceLabel[];
}): ReactNode {
  return <>{renderInlineMarkdown(content, references)}</>;
}
