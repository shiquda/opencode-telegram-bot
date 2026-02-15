import { marked, type Tokens } from "marked";
import { logger } from "./logger.js";

class TelegramRenderer extends marked.Renderer {
  private escapeHtml(text: string): string {
    const htmlEscapeMap: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return text.replace(/[&<>"]/g, (char) => htmlEscapeMap[char] ?? char);
  }

  heading({ tokens }: Tokens.Heading): string {
    const text = this.parser.parseInline(tokens);
    return `${text}\n\n`;
  }

  paragraph({ tokens }: Tokens.Paragraph): string {
    const text = this.parser.parseInline(tokens);
    return `${text}\n\n`;
  }

  list(token: Tokens.List): string {
    const { items, ordered, start = 1 } = token;
    const startNum = typeof start === "number" ? start : 1;
    const body = items
      .map((item: Tokens.ListItem, index: number) => {
        const itemText = this.parser.parse(item.tokens).trim();
        const marker = item.task
          ? item.checked
            ? "☑️"
            : "⬜"
          : ordered
            ? `${startNum + index}.`
            : "•";
        return `${marker} ${itemText}`;
      })
      .join("\n");
    return `${body}\n\n`;
  }

  listitem({ tokens }: Tokens.ListItem): string {
    return this.parser.parse(tokens);
  }

  checkbox({ checked }: Tokens.Checkbox): string {
    return checked ? "☑️ " : "⬜ ";
  }

  code({ text }: Tokens.Code): string {
    const escaped = this.escapeHtml(text.trim());
    return `<pre>${escaped}</pre>\n\n`;
  }

  codespan({ text }: Tokens.Codespan): string {
    const escaped = this.escapeHtml(text);
    return `<code>${escaped}</code>`;
  }

  em({ tokens }: Tokens.Em): string {
    const text = this.parser.parseInline(tokens);
    return `<i>${text}</i>`;
  }

  strong({ tokens }: Tokens.Strong): string {
    const text = this.parser.parseInline(tokens);
    return `<b>${text}</b>`;
  }

  del({ tokens }: Tokens.Del): string {
    const text = this.parser.parseInline(tokens);
    return `<s>${text}</s>`;
  }

  link({ href, tokens }: Tokens.Link): string {
    const text = this.parser.parseInline(tokens);
    const escapedHref = this.escapeHtml(href);
    return `<a href="${escapedHref}">${text}</a>`;
  }

  image({ href, text }: Tokens.Image): string {
    const escapedHref = this.escapeHtml(href);
    return `<a href="${escapedHref}">${text || "Image"}</a>`;
  }

  blockquote({ tokens }: Tokens.Blockquote): string {
    const text = this.parser.parse(tokens);
    return `<blockquote>${text.trim()}</blockquote>\n\n`;
  }

  hr(): string {
    return "\n──────────\n\n";
  }

  br(): string {
    return "\n";
  }

  table({ header, rows }: Tokens.Table): string {
    const plainFromCell = (cell: Tokens.TableCell): string => {
      const rendered = this.parser.parseInline(cell.tokens);
      const withoutTags = rendered
        .replace(/<[^>]+>/g, "")
        .replace(/\n+/g, " ")
        .trim();
      return withoutTags;
    };

    const lines: string[] = [];

    if (header.length > 0) {
      lines.push(`| ${header.map(plainFromCell).join(" | ")} |`);
      lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    }

    for (const row of rows) {
      lines.push(`| ${row.map(plainFromCell).join(" | ")} |`);
    }

    if (lines.length === 0) {
      return "";
    }

    const escapedTable = this.escapeHtml(lines.join("\n"));
    return `<pre>${escapedTable}</pre>\n\n`;
  }

  tablerow({ text }: Tokens.TableRow): string {
    return text;
  }

  tablecell({ text }: Tokens.TableCell): string {
    return text;
  }

  html({ text }: Tokens.HTML): string {
    return this.escapeHtml(text);
  }

  text({ text }: Tokens.Text | Tokens.Escape): string {
    return this.escapeHtml(text);
  }
}

const renderer = new TelegramRenderer();

export function markdownToTelegram(markdown: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return "";
  }

  try {
    const result = marked.parse(markdown, { renderer, async: false }) as string;
    // Clean up excessive newlines
    return result.replace(/\n{3,}/g, "\n\n").trim();
  } catch (error) {
    logger.error("[Markdown] Error converting markdown:", error);
    // Fallback: escape the raw text
    const htmlEscapeMap: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return markdown.replace(/[&<>"]/g, (char) => htmlEscapeMap[char] ?? char);
  }
}

/**
 * Alias for markdownToTelegram - kept for backward compatibility.
 */
export const markdownToHtml = markdownToTelegram;

/**
 * Split formatted text into chunks that fit within Telegram's message limit.
 */
export function formatMarkdownChunks(text: string, maxLength = 4096): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const formatted = markdownToTelegram(text);

  if (formatted.length <= maxLength) {
    return [formatted];
  }

  const chunks: string[] = [];
  const paragraphs = formatted.split("\n\n");
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxLength - 2) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;

      if (currentChunk.length > maxLength) {
        const lines = currentChunk.split("\n");
        let tempChunk = "";
        for (const line of lines) {
          if ((tempChunk + line).length > maxLength - 1) {
            if (tempChunk) {
              chunks.push(tempChunk.trim());
            }
            tempChunk = line;
            if (tempChunk.length > maxLength) {
              chunks.push(tempChunk.slice(0, maxLength));
              tempChunk = tempChunk.slice(maxLength);
            }
          } else {
            tempChunk += (tempChunk ? "\n" : "") + line;
          }
        }
        if (tempChunk) {
          currentChunk = tempChunk;
        } else {
          currentChunk = "";
        }
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
