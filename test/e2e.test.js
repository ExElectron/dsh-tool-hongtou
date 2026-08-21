import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDocument, validateGeneratedXml } from "../lib/phase2-render.js";
import { deterministicDraft } from "../lib/fallback.js";

const snapshot = {
  session: { id: "e2e", cwd: "C:\\workspace" },
  events: [
    { seq: 0, type: "user/message", data: { text: "开发并重构红头公文插件。" } },
    { seq: 1, type: "tool/call", data: { name: "write", arguments: { file_path: "lib/index.js" } } },
    { seq: 2, type: "tool/result", data: { ok: true, output: "完成" } },
    { seq: 3, type: "assistant/message", data: { text: "插件开发完成，测试通过，可正常生成公文。" } },
  ],
};

test("端到端：JSON 提纲 → 模板注入 → 合规 XML", async () => {
  const draft = deterministicDraft(snapshot, { subject: "红头公文插件开发事项" });
  const xml = await renderDocument(draft, { date: new Date() });
  const failures = validateGeneratedXml(xml);
  assert.deepEqual(failures, []);
  assert.ok(xml.includes(draft.issuer));
  assert.ok(xml.includes(draft.documentNumber));
  assert.ok(xml.includes(draft.title));
  for (const section of draft.sections) {
    assert.ok(xml.includes(section.title));
    for (const paragraphText of section.paragraphs) {
      const needle = paragraphText.slice(0, 12);
      assert.ok(xml.includes(needle), `正文段落缺失：${needle}`);
    }
  }
});
