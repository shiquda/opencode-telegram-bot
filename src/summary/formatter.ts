import { ToolInfo } from "./aggregator.js";
import * as path from "path";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import { formatMarkdownChunks } from "../utils/markdown.js";

const TELEGRAM_MESSAGE_LIMIT = 4096;

function splitText(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    let endIndex = currentIndex + maxLength;

    if (endIndex >= text.length) {
      parts.push(text.slice(currentIndex));
      break;
    }

    const breakPoint = text.lastIndexOf("\n", endIndex);
    if (breakPoint > currentIndex) {
      endIndex = breakPoint + 1;
    }

    parts.push(text.slice(currentIndex, endIndex));
    currentIndex = endIndex;
  }

  return parts;
}

export function formatSummary(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  return formatMarkdownChunks(text, TELEGRAM_MESSAGE_LIMIT);
}

function getToolDetails(tool: string, input?: { [key: string]: unknown }): string {
  if (!input) {
    return "";
  }

  // First, check fields specific to known tools
  switch (tool) {
    case "read":
    case "edit":
    case "write":
      const path = input.path || input.filePath;
      if (typeof path === "string") return path;
      break;
    case "bash":
      if (typeof input.command === "string") return input.command;
      break;
    case "grep":
    case "glob":
      if (typeof input.pattern === "string") return input.pattern;
      break;
  }

  // Generic search for MCP and other tools
  // Look for common fields: query, url, name, prompt
  const commonFields = ["query", "url", "name", "prompt", "text"];
  for (const field of commonFields) {
    if (typeof input[field] === "string") {
      return input[field];
    }
  }

  // If nothing matched but string fields exist, take the first one (except description)
  for (const [key, value] of Object.entries(input)) {
    if (key !== "description" && typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return "";
}

function getToolIcon(tool: string): string {
  switch (tool) {
    case "read":
      return "📖";
    case "write":
      return "✍️";
    case "edit":
      return "✏️";
    case "bash":
      return "💻";
    case "glob":
      return "📁";
    case "grep":
      return "🔍";
    case "task":
      return "🤖";
    case "question":
      return "❓";
    case "todoread":
      return "📋";
    case "todowrite":
      return "📝";
    case "webfetch":
      return "🌐";
    case "web-search_tavily_search":
      return "🔎";
    case "web-search_tavily_extract":
      return "📄";
    case "skill":
      return "🎓";
    default:
      return "🛠️";
  }
}

function formatTodos(todos: Array<{ id: string; content: string; status: string }>): string {
  const MAX_TODOS = 20;

  const statusToMarker: Record<string, string> = {
    completed: "x",
    in_progress: "~",
    pending: "  ",
  };

  const formattedTodos: string[] = [];

  for (let i = 0; i < Math.min(todos.length, MAX_TODOS); i++) {
    const todo = todos[i];
    const marker = statusToMarker[todo.status] ?? " ";
    formattedTodos.push(`[${marker}] ${todo.content}`);
  }

  let result = formattedTodos.join("\n");

  if (todos.length > MAX_TODOS) {
    result += `\n${t("tool.todo.overflow", { count: todos.length - MAX_TODOS })}`;
  }

  return result;
}

export function formatToolInfo(toolInfo: ToolInfo): string | null {
  const { tool, input, title } = toolInfo;
  logger.debug(
    `[Formatter] formatToolInfo: tool=${tool}, hasMetadata=${!!toolInfo.metadata}, hasFilediff=${!!toolInfo.metadata?.filediff}`,
  );

  if (tool === "todowrite" && toolInfo.metadata?.todos) {
    const todos = toolInfo.metadata.todos as Array<{
      id: string;
      content: string;
      status: string;
      priority?: string;
    }>;
    const toolIcon = getToolIcon(tool);
    const todosList = formatTodos(todos);
    return `${toolIcon} ${tool} (${todos.length})\n${todosList}`;
  }

  let details = title || getToolDetails(tool, input);
  const toolIcon = getToolIcon(tool);

  let description = "";
  if (input && typeof input.description === "string") {
    description = `${input.description}\n`;
  }

  if (tool === "bash" && input && typeof input.command === "string") {
    details = input.command;
  }

  const detailsStr = details ? ` ${details}` : "";
  let lineInfo = "";

  if (tool === "write" && input && "content" in input && typeof input.content === "string") {
    const lines = countLines(input.content);
    lineInfo = ` (+${lines})`;
  }

  if (tool === "edit" && toolInfo.metadata && "filediff" in toolInfo.metadata) {
    const filediff = toolInfo.metadata.filediff as { additions?: number; deletions?: number };
    logger.debug("[Formatter] Edit metadata:", JSON.stringify(toolInfo.metadata, null, 2));
    const parts = [];
    if (filediff.additions && filediff.additions > 0) parts.push(`+${filediff.additions}`);
    if (filediff.deletions && filediff.deletions > 0) parts.push(`-${filediff.deletions}`);
    if (parts.length > 0) {
      lineInfo = ` (${parts.join(" ")})`;
    }
  }

  return `${toolIcon} ${description}${tool}${detailsStr}${lineInfo}`;
}

function countLines(text: string): number {
  return text.split("\n").length;
}

export interface CodeFileData {
  buffer: Buffer;
  filename: string;
  caption: string;
}

function formatDiff(diff: string): string {
  const lines = diff.split("\n");
  const formattedLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("Index:")) {
      continue;
    }
    if (line.startsWith("===") && line.includes("=")) {
      continue;
    }
    if (line.startsWith("\\ No newline")) {
      continue;
    }

    if (line.startsWith(" ")) {
      formattedLines.push(" " + line.slice(1));
    } else if (line.startsWith("+")) {
      formattedLines.push("+ " + line.slice(1));
    } else if (line.startsWith("-")) {
      formattedLines.push("- " + line.slice(1));
    } else {
      formattedLines.push(line);
    }
  }

  return formattedLines.join("\n");
}

export function prepareCodeFile(
  content: string,
  filePath: string,
  operation: "write" | "edit",
): CodeFileData | null {
  let processedContent = content;

  if (operation === "edit") {
    processedContent = formatDiff(content);
  }

  const sizeKb = Buffer.byteLength(processedContent, "utf8") / 1024;

  if (sizeKb > config.files.maxFileSizeKb) {
    logger.debug(
      `[Formatter] File too large: ${filePath} (${sizeKb.toFixed(2)} KB > ${config.files.maxFileSizeKb} KB)`,
    );
    return null;
  }

  const header =
    operation === "write"
      ? t("tool.file_header.write", { path: filePath })
      : t("tool.file_header.edit", { path: filePath });
  const fullContent = header + processedContent;

  const buffer = Buffer.from(fullContent, "utf8");
  const basename = path.basename(filePath);
  const filename = `${operation}_${basename}.txt`;

  return { buffer, filename, caption: "" };
}
