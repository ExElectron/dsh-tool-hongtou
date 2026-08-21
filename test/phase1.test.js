import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../lib/phase1-llm.js";
import { deterministicDraft } from "../lib/fallback.js";
import { validateDraft } from "../lib/schema.js";

const snapshot = {
  session: { id: "s-1", cwd: "C:\\workspace" },
  events: [
    { seq: 0, type: "user/message", data: { text: "请重构红头公文插件为两阶段流水线。" } },
    { seq: 1, type: "tool/call", data: { name: "write", arguments: { file_path: "lib/schema.js" } } },
    { seq: 2, type: "tool/result", data: { ok: true, output: "写入成功" } },
    { seq: 3, type: "assistant/message", data: { text: "两阶段流水线已重构完成，测试全部通过。" } },
  ],
};

test("extractJson 容忍围栏与前后文字", () => {
  const parsed = extractJson('```json\n{"a":1}\n```');
  assert.deepEqual(parsed, { a: 1 });
  const parsed2 = extractJson('前置文字 {"b":2} 后置文字');
  assert.deepEqual(parsed2, { b: 2 });
  assert.throws(() => extractJson("没有 JSON"), /未返回 JSON/);
});

test("确定性回退输出合法 JSON 提纲", () => {
  const draft = deterministicDraft(snapshot, { subject: "插件重构事项" });
  assert.equal(validateDraft(draft).ok, true);
  assert.ok(draft.sections.length >= 4);
  assert.ok(draft.sections[1].title.includes("调度"));
  assert.ok(JSON.stringify(draft).includes("插件重构事项"));
});

test("确定性回退不泄露 Markdown 与占位符", () => {
  const draft = deterministicDraft(snapshot, { subject: "插件重构事项" });
  const joined = JSON.stringify(draft);
  assert.ok(!/[#*`]|\]\(/u.test(joined));
  assert.ok(!/(xxxx|×{2,}|（空一行）|（空两格）)/iu.test(joined));
});
