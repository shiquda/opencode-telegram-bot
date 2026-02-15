import { marked } from "marked";
import { logger } from "./logger.js";

const MARKDOWN_V2_ESCAPE_CHARS = /[_*\[\]()~`>#+=|{}.!\\-]/g;

function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_ESCAPE_CHARS, "\\$&");
}

function escapeCodeBlock(text: string): string {
  return text.replace(/([`\\])/g, "\\$1");
}

interface Token {
  type: string;
  text?: string;
  tokens?: Token[];
  items?: Token[];
  ordered?: boolean;
  href?: string;
  header?: Token[];
  rows?: Token[][];
}

function convertToken(token: Token): string {
  const innerTokens = token.tokens?.map(convertToken).join("") ?? token.text ?? "";

  switch (token.type) {
    case "text":
      return escapeMarkdownV2(token.text ?? "");

    case "strong":
      return `*${innerTokens}*`;

    case "em":
      return `_${innerTokens}_`;

    case "del":
      return `~${innerTokens}~`;

    case "code":
    case "codespan": {
      const code = escapeCodeBlock(token.text ?? "");
      return code.includes("`") ? `\`\`${code}\`\`` : `\`${code}\``;
    }

    case "link":
      return `[${innerTokens}](${token.href ?? ""})`;

    case "blockquote": {
      return innerTokens
        .split("\n")
        .map((line) => `_${escapeMarkdownV2("> ")}${line}_`)
        .join("\n");
    }

    case "heading":
      return `*${innerTokens}*\n`;

    case "paragraph":
      return `${innerTokens}\n`;

    case "list": {
      const items = (token.items ?? [])
        .map((item, index) => {
          const itemText = item.tokens?.map(convertToken).join("") ?? item.text ?? "";
          const marker = token.ordered ? `${index + 1}.` : "•";
          return `${marker} ${itemText}`;
        })
        .join("\n");
      return `${items}\n`;
    }

    case "space":
    case "br":
      return "\n";

    case "hr":
      return "\n---\n";

    case "html":
      return escapeMarkdownV2((token.text ?? "").replace(/<[^>]+>/g, ""));

    case "table": {
      let result = "";
      if (token.header) {
        result +=
          token.header
            .map((cell) => `*${cell.tokens?.map(convertToken).join("") ?? cell.text ?? ""}*`)
            .join(" | ") + "\n";
      }
      if (token.rows) {
        result += token.rows
          .map((row) =>
            row
              .map((cell) => cell.tokens?.map(convertToken).join("") ?? cell.text ?? "")
              .join(" | "),
          )
          .join("\n");
      }
      return result + "\n";
    }

    default: {
      if (token.tokens) {
        return token.tokens.map(convertToken).join("");
      }
      if (token.text) {
        return escapeMarkdownV2(token.text);
      }
      logger.debug(`[Markdown] Unknown token type: ${token.type}`);
      return "";
    }
  }
}

export function markdownToTelegram(markdown: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return "";
  }

  try {
    const tokens = marked.lexer(markdown) as Token[];
    const result = tokens.map(convertToken).join("");
    return result.replace(/\n{3,}/g, "\n\n").trim();
  } catch (error) {
    logger.error("[Markdown] Error converting markdown:", error);
    return escapeMarkdownV2(markdown);
  }
}

export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return "";
  }

  try {
    return marked.parse(markdown, { async: false }) as string;
  } catch (error) {
    logger.error("[Markdown] Error converting to HTML:", error);
    return escapeHtml(markdown);
  }
}

function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char);
}

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
