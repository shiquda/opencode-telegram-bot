import { describe, expect, it } from "vitest";
import { markdownToTelegram } from "../../src/utils/markdown.js";

describe("utils/markdown", () => {
  it("renders task lists without unsupported input tags", () => {
    const source = "- [ ] todo item\n- [x] done item";
    const html = markdownToTelegram(source);

    expect(html).toContain("⬜ todo item");
    expect(html).toContain("☑️ done item");
    expect(html).not.toContain("<input");
  });

  it("renders markdown table as escaped preformatted text", () => {
    const source = "| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |";
    const html = markdownToTelegram(source);

    expect(html.startsWith("<pre>")).toBe(true);
    expect(html).toContain("| Name | Value |");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<tr");
    expect(html).not.toContain("<td");
  });

  it("escapes raw html instead of rendering unsupported tags", () => {
    const html = markdownToTelegram('<input type="checkbox" /> <b>raw</b>');

    expect(html).toContain("&lt;input type=&quot;checkbox&quot; /&gt;");
    expect(html).toContain("&lt;b&gt;raw&lt;/b&gt;");
    expect(html).not.toContain("<input");
  });

  it("keeps heading text without forcing bold heading tags", () => {
    const html = markdownToTelegram("# Title");

    expect(html).toBe("Title");
  });
});
