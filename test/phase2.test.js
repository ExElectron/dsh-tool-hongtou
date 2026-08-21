import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSkeleton, renderDocument, validateGeneratedXml, escapeXml, chineseDate } from "../lib/phase2-render.js";

const draft = {
  issuer: "DeepSeek Harness 平台管理中心",
  documentNumber: "DSH发〔2026〕1号",
  title: "关于两阶段流水线重构事项的办理情况通报",
  recipient: "各受理窗口、相关研发运维组：",
  lead: "现将有关事项办理情况通报如下。",
  sections: [
    { title: "事项起因与背景", paragraphs: ["本事项源于 A < B & C > D 的要求。"], items: [] },
    {
      title: "主要调度与技术执行过程",
      paragraphs: ["整体过程符合预期。"],
      items: [
        "第一子项。",
        { title: "第二子项。", items: ["第三层之一。", { title: "第三层之二。", items: ["第四层之一。"] }] },
      ],
    },
  ],
  attachments: ["附件名称甲", "附件名称乙"],
  closing: "请各有关单位抓好落实。",
};

test("模板骨架不含文本框、批注且保留样板版心", async () => {
  const template = await loadSkeleton();
  assert.ok(!/<(?:w:txbxContent|v:textbox|aml:annotation|w:commentRangeStart|w:comment)\b/iu.test(template));
  assert.ok(template.includes('<w:pgMar w:top="2098" w:right="1474" w:bottom="1985" w:left="1588"'));
  assert.ok(template.includes("<!--HONDTOU:BODY-->"));
  assert.ok(template.includes("方正粗宋简体"));
});

test("红头使用样板艺术字与双红线", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(xml.includes("v:textpath"));
  assert.ok(xml.includes('string="DeepSeek Harness 平台管理中心"'));
  assert.ok(xml.includes("font-family:&quot;华文中宋&quot;;font-weight:bold"));
  assert.ok(xml.includes('strokeweight="3pt"'));
  assert.ok(xml.includes('strokeweight="1.5pt"'));
  assert.ok(xml.includes('from="5.25pt,53.2pt" to="446.25pt,53.2pt"'));
  assert.ok(xml.includes('fillcolor="red"'));
});

test("发文字号 3 号仿宋居右空一字", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(xml.includes("DSH发〔2026〕1号"));
  assert.ok(xml.includes('<w:ind w:right="320"/><w:jc w:val="right"/>'));
});

test("标题方正小标宋体 2 号居中", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(xml.includes('<w:rFonts w:ascii="方正小标宋简体" w:fareast="方正小标宋简体"/><wx:font wx:val="方正小标宋简体"/><w:sz w:val="44"/>'));
  assert.ok(xml.includes('<w:jc w:val="center"/>'));
});

test("正文段落与四级层次序号、字体正确", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(xml.includes('w:first-line-chars="200" w:first-line="640"'));
  assert.ok(xml.includes('w:spacing w:line="560" w:line-rule="exact"'));
  assert.ok(xml.includes("一、事项起因与背景"));
  assert.ok(xml.includes("二、主要调度与技术执行过程"));
  assert.ok(xml.includes("（一）第一子项。"));
  assert.ok(xml.includes("（二）第二子项。"));
  assert.ok(xml.includes("1. 第三层之一。"));
  assert.ok(xml.includes("2. 第三层之二。"));
  assert.ok(xml.includes("（1）第四层之一。"));
});

test("附件左空二字、阿拉伯数字编号、悬挂对齐", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(xml.includes("附件："));
  assert.ok(/<w:t>1\. <\/w:t>/.test(xml));
  assert.ok(/<w:t>2\. <\/w:t>/.test(xml));
  assert.ok(xml.includes("附件名称甲"));
  assert.ok(xml.includes("附件名称乙"));
  assert.ok(xml.includes('w:left="1920" w:hanging="1280"'));
});

test("署名以成文日期为准居中、日期居右空 4 字", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(xml.includes("2026年8月20日"));
  assert.ok(xml.includes('<w:ind w:right="640"/><w:jc w:val="right"/>'));
});

test("版记为样板独立文本框形式：双横线紧凑 + 部门框 + 日期框", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  // 双横线：上 y=13330、下 y=13954（间距 624 twips，紧凑），横跨版心 1483→10327
  assert.ok(xml.includes('from="1483,13330" to="10327,13330"'));
  assert.ok(xml.includes('from="1483,13954" to="10327,13954"'));
  assert.ok(xml.includes('top:13330'));
  // 垂直定位固定为相对页面：上横线显示在页面 700pt 处（margin-top=668.8+31.2），
  // 不随锚点段落漂移；页码 framePr y=15083（754pt）在版记下方
  assert.ok(xml.includes("mso-position-vertical-relative:page"));
  assert.ok(xml.includes("margin-top:668.8pt"));
  assert.ok(xml.includes('w:y="15083"'));
  // 部门名称文本框（s2074）与印发日期文本框（s2075），内部 4 号字、禁换行
  assert.ok(xml.includes('id="_x0000_s2074"'));
  assert.ok(xml.includes('id="_x0000_s2075"'));
  assert.ok(xml.includes("DeepSeek Harness 平台管理中心办公室"));
  assert.ok(xml.includes("2026年8月20日印发"));
  assert.ok(xml.includes('<w:sz w:val="28"/>'));
  assert.ok(xml.includes('inset="0,0,0,0"'));
  assert.ok(xml.includes('<w:wordWrap w:val="off"/>'));
  // 版记文本框内部无教学说明文字
  assert.ok(!/(正文用3号仿宋体字|如有多个附件|半角宋体阿拉伯数字|发文机关署名在成文日期之上|“附件”二字)/u.test(xml));
});

test("页码由 PAGE 域生成且无静态页码框架", async () => {
  const xml = await renderDocument(draft, { date: new Date(2026, 7, 20) });
  assert.ok(/<w:instrText>[^<]*PAGE/u.test(xml));
  assert.ok(!/—\s*[0-9]+\s*—/u.test(xml.replace(/<[^>]*>/gu, "")));
});

test("渲染结果无注释残留、无转义错误、通过全部校验", async () => {
  const xml = await renderDocument(draft, { date: new Date() });
  assert.ok(!xml.includes("<!--"));
  assert.ok(xml.includes("A &lt; B &amp; C &gt; D"));
  assert.ok(!xml.includes("A < B & C > D"));
  assert.deepEqual(validateGeneratedXml(xml), []);
});

test("escapeXml 覆盖五种字符", () => {
  assert.equal(escapeXml(`&<>"'`), "&amp;&lt;&gt;&quot;&apos;");
});

test("中文日期格式", () => {
  assert.equal(chineseDate(new Date(2026, 7, 20)), "2026年8月20日");
});
