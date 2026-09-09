import { test } from "node:test";
import assert from "node:assert/strict";
import { deterministicDraft } from "../lib/fallback.js";

test("deterministicDraft 的结论段落不出现重复句号", () => {
  const snapshot = {
    session: { id: "fallback-probe" },
    events: [
      { seq: 1, type: "user/message", data: { text: "重构红头公文插件" } },
      { seq: 2, type: "assistant/message", data: { text: "重构完成，测试全部通过。" } },
    ],
  };
  const draft = deterministicDraft(snapshot, { subject: "重复句号验证" });
  const section = draft.sections.find((item) => item.title === "成果与验收结论");
  const paragraph = section.paragraphs[0];
  assert.ok(paragraph.includes("测试全部通过。该结论"));
  assert.ok(!paragraph.includes("。。"));
});
