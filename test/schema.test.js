import { test } from "node:test";
import assert from "node:assert/strict";
import { stripMarkdown, hasForbiddenContent, sanitizeText, sanitizeParagraphs, validateDraft, normalizeDraft } from "../lib/schema.js";

test("stripMarkdown 清除链接、强调、列表与代码符号", () => {
  const input = [
    "## 标题泄露",
    "> 引用泄露",
    "- 列表项泄露",
    "1. 有序列表泄露",
    "这是 **加粗** 与 `code` 以及 [链接文字](https://example.com)",
    "![图片说明](x.png)",
    "| 表格 | 管道 |",
  ].join("\n");
  const cleaned = stripMarkdown(input);
  assert.ok(!cleaned.includes("##"));
  assert.ok(!cleaned.includes(">"));
  assert.ok(!cleaned.includes("**"));
  assert.ok(!cleaned.includes("`"));
  assert.ok(!cleaned.includes("](https://"));
  assert.ok(cleaned.includes("链接文字"));
  assert.ok(cleaned.includes("图片说明"));
  assert.ok(!cleaned.includes("|"));
});

test("占位符与排版动作字符被识别", () => {
  assert.ok(hasForbiddenContent("这是 xxxx 占位"));
  assert.ok(hasForbiddenContent("这是 ××× 占位"));
  assert.ok(hasForbiddenContent("（空一行）"));
  assert.ok(hasForbiddenContent("（空两格）"));
  assert.ok(hasForbiddenContent("（此处填写内容）"));
  assert.ok(!hasForbiddenContent("正常的公文内容。"));
});

test("sanitizeText 剔除非法内容并回退", () => {
  assert.equal(sanitizeText("**加粗** 正文"), "加粗 正文");
  assert.equal(sanitizeText("xxxx", "回退文本"), "回退文本");
  assert.equal(sanitizeText("  ", "回退文本"), "回退文本");
});

test("validateDraft 拒绝结构错误", () => {
  const verdict = validateDraft({ issuer: "x", title: "短", sections: [] });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.length > 0);
});

test("validateDraft 接受规范提纲（含嵌套层次与附件）", () => {
  const candidate = {
    issuer: "DeepSeek Harness 平台管理中心",
    documentNumber: "DSH发〔2026〕1号",
    title: "关于插件重构事项的办理情况通报",
    recipient: "各受理窗口：",
    lead: "现将有关事项通报如下。",
    sections: [
      {
        title: "事项起因与背景",
        paragraphs: ["第一段。"],
        items: [
          "子项一。",
          { title: "子项二。", items: ["三层一。", { title: "三层二。", items: ["四层一。"] }] },
        ],
      },
    ],
    attachments: ["附件甲"],
    closing: "特此通报。",
  };
  assert.deepEqual(validateDraft(candidate), { ok: true, errors: [] });
});

test("validateDraft 拒绝超深层嵌套", () => {
  const candidate = {
    issuer: "甲机关",
    documentNumber: "DSH发〔2026〕1号",
    title: "关于某事项的办理情况通报",
    recipient: "各有关单位：",
    lead: "现将有关事项通报如下。",
    sections: [
      { title: "事项起因", paragraphs: ["正文。"], items: [{ title: "一层", items: [{ title: "二层", items: [{ title: "三层", items: [{ title: "四层超限", items: [] }] }] }] }] },
    ],
    closing: "特此通报。",
  };
  assert.equal(validateDraft(candidate).ok, false);
});

test("normalizeDraft 保留合法内容并生成回退段落", () => {
  const draft = normalizeDraft({
    issuer: "×××",
    title: "关于测试事项的办理情况通报",
    sections: [{ title: "起因与背景", paragraphs: ["（空一行）", "有效段落"], items: [] }],
  }, { subject: "测试事由", date: new Date(2026, 7, 20) });
  assert.equal(draft.issuer, "DeepSeek Harness 平台管理中心");
  assert.ok(draft.sections[0].paragraphs.includes("有效段落"));
  assert.ok(draft.documentNumber.includes("DSH发〔2026〕"));
  assert.ok(!hasForbiddenContent(JSON.stringify(draft)));
});

test("normalizeDraft 清洗嵌套层次与附件", () => {
  const draft = normalizeDraft({
    issuer: "DeepSeek Harness 平台管理中心",
    documentNumber: "DSH发〔2026〕1号",
    title: "关于测试事项的办理情况通报",
    recipient: "各有关单位：",
    lead: "导语。",
    sections: [
      { title: "背景", paragraphs: [], items: [{ title: "（空一行）", items: ["有效三层"] }] },
    ],
    attachments: ["附件甲", "xxxx"],
    closing: "结语。",
  }, { subject: "测试事由" });
  assert.deepEqual(draft.sections[0].items, []);
  assert.deepEqual(draft.attachments, ["附件甲"]);
});
