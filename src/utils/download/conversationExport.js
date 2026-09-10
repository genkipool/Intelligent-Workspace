/**
 * Conversation export formats and downloader for Gemini conversations.
 *
 * Supports exporting in HTML, JSON, Markdown, and plain text (TXT).
 */
import { parseMarkdown } from '../../ui/content-renderer/content-renderer.js';

/**
 * Escapes special HTML characters.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Strips markdown and HTML formatting to plain text.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToPlainText(markdown) {
    if (!markdown) return '';
    if (typeof document !== 'undefined') {
        const holder = document.createElement('div');
        holder.innerHTML = parseMarkdown(markdown);
        return (holder.textContent || '').trim();
    }
    return markdown
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[\*-]\s+/gm, '')
        .trim();
}

/**
 * Cleans a filename to be safe for saving to disk.
 *
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFilename(filename) {
    if (!filename || filename.trim() === '') {
        return 'gemini_conversation';
    }
    return filename
        .replace(/[<>:"/\\|?*]/g, '_')
        .substring(0, 100)
        .trim();
}

/**
 * Normalizes a CSS color string to a hex or standard color code.
 *
 * @param {string} color
 * @returns {string}
 */
export function normalizeColorCode(color) {
    if (!color) return '#3498db';
    const trimmed = color.trim();
    const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
        const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
        const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
        const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    return trimmed;
}

/**
 * Returns the currently active theme's --text-on-color value.
 *
 * @returns {string}
 */
export function getThemeTextOnColor() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const rootColor = window.getComputedStyle(document.documentElement).getPropertyValue('--text-on-color')?.trim();
        if (rootColor) return normalizeColorCode(rootColor);
        const bodyColor = window.getComputedStyle(document.body).getPropertyValue('--text-on-color')?.trim();
        if (bodyColor) return normalizeColorCode(bodyColor);
    }
    return '#3498db';
}

/**
 * Exports the conversation as a self-contained HTML page.
 *
 * @param {string} title
 * @param {Array<{ query: string, data?: { answer?: string } }>} entries
 * @param {{ queryColor?: string }} [options]
 * @returns {string}
 */
export function exportConversationAsHtml(title, entries = [], options = {}) {
    const safeTitle = escapeHtml(title || 'Gemini Conversation');
    const queryColor = options.queryColor ? normalizeColorCode(options.queryColor) : getThemeTextOnColor();

    const entriesHtml = entries
        .map((entry) => {
            const question = escapeHtml(entry?.query || '');
            const answerMarkdown = entry?.data?.answer || '';
            const answerHtml = parseMarkdown(answerMarkdown);

            return `        <div class="entry">
            <div class="query">${question}</div>
            <div class="answer">
                ${answerHtml}
            </div>
        </div>`;
        })
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
        }
        :root {
            --text-on-color: ${queryColor};
        }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            overflow-x: hidden;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
            padding: 24px;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .conversation-container {
            width: 100%;
            max-width: 840px;
            margin: 0 auto;
            background: #fff;
            padding: 32px;
            border-radius: 12px;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
            overflow-wrap: anywhere;
            word-break: break-word;
            overflow-x: hidden;
        }
        h1 {
            font-size: 1.6em;
            color: ${queryColor};
            border-bottom: 2px solid ${queryColor};
            padding-bottom: 12px;
            margin-top: 0;
            margin-bottom: 28px;
            text-align: center;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .entry {
            margin-bottom: 24px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            background-color: #fff;
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .query {
            font-weight: 600;
            font-size: 1.05em;
            color: ${queryColor};
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
            overflow-wrap: anywhere;
            word-break: break-word;
            white-space: pre-wrap;
        }
        .answer {
            font-size: 1em;
            color: #202124;
            line-height: 1.6;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .answer p:first-child { margin-top: 0; }
        .answer p:last-child { margin-bottom: 0; }
        pre {
            background-color: #f1f3f4;
            padding: 14px;
            border-radius: 6px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: Consolas, 'Courier New', monospace;
            font-size: 0.9em;
        }
        code {
            font-family: Consolas, 'Courier New', monospace;
            padding: 2px 5px;
            border-radius: 4px;
            font-size: 0.9em;
            background-color: #f1f3f4;
            color: #1a73e8;
        }
        pre > code {
            background-color: transparent;
            padding: 0;
            color: inherit;
        }
        ul, ol {
            padding-left: 24px;
            margin-bottom: 14px;
        }
        blockquote {
            border-left: 4px solid #1a73e8;
            margin: 12px 0;
            padding: 8px 16px;
            background-color: #f8f9fa;
            color: #555;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        @media print {
            body { background: #fff; padding: 0; }
            .conversation-container { box-shadow: none; padding: 0; }
            .entry { page-break-inside: avoid; border: 1px solid #ccc; }
        }
    </style>
</head>
<body>
    <div class="conversation-container">
        <h1>${safeTitle}</h1>
        <div class="entries-container">
${entriesHtml}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Exports the conversation in structured JSON format.
 *
 * @param {string} title
 * @param {Array<{ id?: string, timestamp?: number, query: string, data?: { answer?: string } }>} entries
 * @returns {string}
 */
export function exportConversationAsJson(title, entries = []) {
    const data = {
        title: title || 'Gemini Conversation',
        exportedAt: new Date().toISOString(),
        totalEntries: entries.length,
        entries: entries.map((entry, index) => ({
            index: index + 1,
            id: entry.id || null,
            timestamp: entry.timestamp || null,
            query: entry.query || '',
            answer: entry.data?.answer || '',
        })),
    };
    return JSON.stringify(data, null, 2);
}

/**
 * Exports the conversation as clean Markdown.
 *
 * @param {string} title
 * @param {Array<{ query: string, data?: { answer?: string } }>} entries
 * @returns {string}
 */
export function exportConversationAsMarkdown(title, entries = []) {
    const heading = `# ${title || 'Gemini Conversation'}\n\n`;
    const body = entries
        .map((entry, index) => {
            const q = `## Q${index + 1}: ${entry.query || ''}\n\n`;
            const a = `${entry.data?.answer || ''}\n\n---\n`;
            return q + a;
        })
        .join('\n');
    return heading + body;
}

/**
 * Exports the conversation as formatted plain text.
 *
 * @param {string} title
 * @param {Array<{ query: string, data?: { answer?: string } }>} entries
 * @returns {string}
 */
export function exportConversationAsTxt(title, entries = []) {
    const safeTitle = (title || 'Gemini Conversation').toUpperCase();
    const separator = '='.repeat(70);
    const thinSeparator = '-'.repeat(70);

    let output = `${separator}\n${safeTitle}\n${separator}\n\n`;

    entries.forEach((entry, index) => {
        const question = entry.query || '';
        const answer = markdownToPlainText(entry.data?.answer || '');
        output += `[Q${index + 1}] ${question}\n`;
        output += `${thinSeparator}\n`;
        output += `${answer}\n\n`;
    });

    return output.trim();
}

/**
 * Triggers a file download in the browser for a given Blob.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Downloads a conversation in one or more selected formats.
 * Staggers downloads slightly so the browser doesn't drop consecutive files.
 *
 * @param {string} title
 * @param {Array} entries
 * @param {Array<'html'|'json'|'markdown'|'txt'>} formats
 * @param {{ queryColor?: string }} [options]
 * @returns {Promise<number>} Number of files downloaded
 */
export async function downloadConversationFiles(title, entries, formats, options = {}) {
    const wanted = new Set(Array.isArray(formats) ? formats : [formats]);
    const baseName = sanitizeFilename(title);

    const downloads = [];

    if (wanted.has('html')) {
        downloads.push({
            blob: new Blob([exportConversationAsHtml(title, entries, options)], { type: 'text/html;charset=utf-8' }),
            filename: `${baseName}.html`,
        });
    }

    if (wanted.has('json')) {
        downloads.push({
            blob: new Blob([exportConversationAsJson(title, entries)], { type: 'application/json;charset=utf-8' }),
            filename: `${baseName}.json`,
        });
    }

    if (wanted.has('markdown')) {
        downloads.push({
            blob: new Blob([exportConversationAsMarkdown(title, entries)], { type: 'text/markdown;charset=utf-8' }),
            filename: `${baseName}.md`,
        });
    }

    if (wanted.has('txt')) {
        downloads.push({
            blob: new Blob([exportConversationAsTxt(title, entries)], { type: 'text/plain;charset=utf-8' }),
            filename: `${baseName}.txt`,
        });
    }

    for (let i = 0; i < downloads.length; i++) {
        triggerBlobDownload(downloads[i].blob, downloads[i].filename);
        if (i < downloads.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
    }

    return downloads.length;
}
