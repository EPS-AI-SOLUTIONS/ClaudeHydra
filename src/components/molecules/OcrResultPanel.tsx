/** Jaskier Shared Pattern — OcrResultPanel */

import DOMPurify from 'dompurify';
import { Check, ChevronLeft, ChevronRight, Code2, Copy, Download, Eye, FileDown, Loader2 } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge  } from '@jaskier/ui';
import { Button  } from '@jaskier/ui';
import { Card  } from '@jaskier/ui';
import { cn } from '@/shared/utils/cn';

interface OcrResultPanelProps {
  pages: Array<{ page_number: number; text: string }>;
  totalPages: number;
  processingTimeMs: number;
  provider: string;
  className?: string;
  outputFormat?: 'text' | 'html';
  onFormatChange?: (f: 'text' | 'html') => void;
  isFormatLoading?: boolean;
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'br',
    'hr',
    'span',
    'div',
    'pre',
    'code',
  ],
  ALLOWED_ATTR: ['data-page', 'colspan', 'rowspan'],
};

/** Convert markdown text to a simple HTML string for rich clipboard copy. */
function markdownToHtml(md: string): string {
  // Tables
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let headerDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    const cells = line.match(/^\|(.+)\|$/);

    if (cells) {
      // Check if next line is separator (|---|---|)
      const nextLine = lines[i + 1]?.trim() ?? '';
      const isSeparator = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(line);

      if (isSeparator) {
        // Skip separator row
        continue;
      }

      if (!inTable) {
        out.push('<table style="border-collapse:collapse;border:1px solid #555;">');
        inTable = true;
        headerDone = false;
      }

      const cellValues = (cells[1] ?? '').split('|').map((c) => c.trim());
      const isSep = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(nextLine);

      if (!headerDone && isSep) {
        // This is header row
        out.push('<tr>');
        for (const c of cellValues) {
          out.push(
            `<th style="border:1px solid #555;padding:4px 8px;font-weight:bold;">${processInline(escapeHtml(c))}</th>`,
          );
        }
        out.push('</tr>');
        headerDone = true;
      } else {
        out.push('<tr>');
        for (const c of cellValues) {
          out.push(`<td style="border:1px solid #555;padding:4px 8px;">${processInline(escapeHtml(c))}</td>`);
        }
        out.push('</tr>');
      }
    } else {
      if (inTable) {
        out.push('</table>');
        inTable = false;
        headerDone = false;
      }

      // Headers
      if (line.startsWith('### ')) {
        out.push(`<h3>${processInline(escapeHtml(line.slice(4)))}</h3>`);
      } else if (line.startsWith('## ')) {
        out.push(`<h2>${processInline(escapeHtml(line.slice(3)))}</h2>`);
      } else if (line.startsWith('# ')) {
        out.push(`<h1>${processInline(escapeHtml(line.slice(2)))}</h1>`);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        out.push(`<li>${processInline(escapeHtml(line.slice(2)))}</li>`);
      } else if (/^\d+\.\s/.test(line)) {
        out.push(`<li>${processInline(escapeHtml(line.replace(/^\d+\.\s/, '')))}</li>`);
      } else if (line === '') {
        out.push('<br/>');
      } else {
        out.push(`<p>${processInline(escapeHtml(line))}</p>`);
      }
    }
  }
  if (inTable) out.push('</table>');

  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Process inline markdown: **bold** → <strong>, *italic* → <em>. Call AFTER escapeHtml. */
function processInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export const OcrResultPanel = memo(function OcrResultPanel({
  pages,
  totalPages,
  processingTimeMs,
  provider,
  className,
  outputFormat = 'text',
  onFormatChange,
  isFormatLoading,
}: OcrResultPanelProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const [showRendered, setShowRendered] = useState(true);
  const [copied, setCopied] = useState(false);
  const renderedRef = useRef<HTMLDivElement>(null);

  const page = pages[currentPage];
  const hasMultiplePages = pages.length > 1;

  const fullText = useMemo(() => pages.map((p) => p.text).join('\n\n---\n\n'), [pages]);

  const currentText = showFullText ? fullText : (page?.text ?? '');

  const sanitizedHtml = useMemo(
    () => (outputFormat === 'html' ? DOMPurify.sanitize(currentText, PURIFY_CONFIG) : ''),
    [currentText, outputFormat],
  );

  /** Rich copy: text/html (for Word/Excel/Docs) + text/plain (for editors). */
  const handleCopy = useCallback(async () => {
    try {
      const html = outputFormat === 'html' ? currentText : markdownToHtml(currentText);
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([currentText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
    } catch {
      // Fallback for older browsers / insecure context
      await navigator.clipboard.writeText(currentText);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentText, outputFormat]);

  const handleExportMd = useCallback(() => {
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fullText]);

  /** Export as .html (Word-compatible with formatted tables). */
  const handleExportHtml = useCallback(() => {
    const body = outputFormat === 'html' ? fullText : markdownToHtml(fullText);
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OCR Result</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;max-width:800px;margin:20px auto}
table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #555;padding:6px 10px;text-align:left}
th{font-weight:bold;background:#f0f0f0}h1,h2,h3{margin:16px 0 8px}</style>
</head><body>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fullText, outputFormat]);

  if (!pages.length) return null;

  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--matrix-text-primary)' }}>
            OCR
          </span>
          <Badge variant="accent" size="sm">
            {provider}
          </Badge>
          <Badge variant="default" size="sm">
            {totalPages} {totalPages === 1 ? 'strona' : totalPages < 5 ? 'strony' : 'stron'}
          </Badge>
          <span className="text-xs" style={{ color: 'var(--matrix-text-secondary)' }}>
            {(processingTimeMs / 1000).toFixed(1)}s
          </span>
        </div>

        <div className="flex items-center gap-1">
          {hasMultiplePages && (
            <Button variant="ghost" size="sm" onClick={() => setShowFullText((v) => !v)}>
              {showFullText ? 'Strony' : 'Pełny tekst'}
            </Button>
          )}
          {/* Text/HTML format toggle */}
          {onFormatChange && (
            <div
              className="flex items-center rounded-md overflow-hidden border"
              style={{ borderColor: 'var(--matrix-border)' }}
            >
              <button
                type="button"
                onClick={() => onFormatChange('text')}
                disabled={isFormatLoading}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium transition-colors',
                  outputFormat === 'text'
                    ? 'bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)]'
                    : 'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-text-primary)]',
                )}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => onFormatChange('html')}
                disabled={isFormatLoading}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium transition-colors',
                  outputFormat === 'html'
                    ? 'bg-[var(--matrix-accent)]/20 text-[var(--matrix-accent)]'
                    : 'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-text-primary)]',
                )}
              >
                {isFormatLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'HTML'}
              </button>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRendered((v) => !v)}
            title={showRendered ? 'Pokaż źródło' : 'Pokaż sformatowany'}
          >
            {showRendered ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} title="Kopiuj (z formatowaniem)">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportMd} title="Pobierz .md">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportHtml} title="Pobierz .html (Word)">
            <FileDown className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Page navigation */}
      {hasMultiplePages && !showFullText && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs tabular-nums" style={{ color: 'var(--matrix-text-secondary)' }}>
            {page?.page_number ?? currentPage + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= pages.length - 1}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Content */}
      {outputFormat === 'html' ? (
        showRendered ? (
          <div
            ref={renderedRef}
            className="ocr-html-content text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3"
            style={{
              color: 'var(--matrix-text-primary)',
              backgroundColor: 'var(--matrix-bg-secondary)',
              border: '1px solid var(--matrix-border)',
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify sanitized
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <pre
            className="whitespace-pre-wrap break-words text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              color: 'var(--matrix-text-primary)',
              backgroundColor: 'var(--matrix-bg-secondary)',
              border: '1px solid var(--matrix-border)',
            }}
          >
            {currentText}
          </pre>
        )
      ) : showRendered ? (
        <div
          ref={renderedRef}
          className="ocr-rendered text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3"
          style={{
            color: 'var(--matrix-text-primary)',
            backgroundColor: 'var(--matrix-bg-secondary)',
            border: '1px solid var(--matrix-border)',
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentText}</ReactMarkdown>
        </div>
      ) : (
        <pre
          className="whitespace-pre-wrap break-words text-xs leading-relaxed max-h-96 overflow-y-auto rounded-md p-3"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: 'var(--matrix-text-primary)',
            backgroundColor: 'var(--matrix-bg-secondary)',
            border: '1px solid var(--matrix-border)',
          }}
        >
          {currentText}
        </pre>
      )}
    </Card>
  );
});
