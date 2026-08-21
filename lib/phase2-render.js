// 阶段二：确定性排版渲染 —— 完全复刻标准红头公文样板版式 + 用户指定公文规范。
// 红头机关名用 VML 艺术字（v:textpath 华文中宋加粗红色），红色分割线为
// 双 VML 线条（3pt/1.5pt）；发文字号 3 号仿宋居右空一字；标题方正小标宋体
// 2 号居中；正文 3 号仿宋、每段左空二字回行顶格；层次序数“一、”“（一）”
// “1.”“（1）”分别用黑体、楷体、仿宋、仿宋；附件左空二字、回行对齐名称
// 首字；署名以成文日期为准居中；日期居右空 4 字；页码 4 号半角宋体一字线
// （奇数页居右空一字、偶数页居左空一字，由样板 sectPr 页脚 PAGE 域提供）。

import { readFile } from "node:fs/promises";
import { CN_NUMERALS, sanitizeText } from "./schema.js";

const BODY_MARKER = "<!--HONDTOU:BODY-->";

// 样板 P1 红头段落中的艺术字类型定义（v:textpath，原样复制）。
const TEXTPATH_SHAPETYPE = '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';

// 样板 P1 红头段落中的双红线（VML 线条，原样坐标）。
const RED_LINE_FINE = '<v:line id="_x0000_s2068" style="position:absolute;left:0;text-align:left;flip:y;z-index:2;mso-position-horizontal-relative:text;mso-position-vertical-relative:text" from="5.1pt,60.65pt" to="446.15pt,60.95pt" strokecolor="red" strokeweight="1.5pt"/>';
const RED_LINE_THICK = '<v:line id="_x0000_s2067" style="position:absolute;left:0;text-align:left;z-index:1;mso-position-horizontal-relative:text;mso-position-vertical-relative:text" from="5.25pt,53.2pt" to="446.25pt,53.2pt" strokecolor="red" strokeweight="3pt"/>';

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

export function chineseDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// 文本视觉宽度：中文按 1 字、ASCII 按 0.5 字估算（1 字 = 16pt = 320 twips）。
function textWidthUnits(text) {
  return [...String(text ?? "")].reduce((sum, ch) => sum + (/[\u2e80-\uffef]/u.test(ch) ? 1 : 0.5), 0);
}

// 机关名估算宽度：中文按 33.25pt/字、ASCII 按 16.6pt/字（样板 12 字 399pt 推算）。
function artTextWidth(issuer) {
  const width = Math.min(441, Math.max(150, Math.round(textWidthUnits(issuer) * 33.25)));
  const marginLeft = Math.round((441 - width) / 2 + 5.25);
  return { width, marginLeft };
}

// 样板 P1 红头段：艺术字机关名 + 粗/细双红线。
function redHeaderParagraph(issuer) {
  const { width, marginLeft } = artTextWidth(issuer);
  const artText = `<w:pict>${TEXTPATH_SHAPETYPE}<v:shape id="_x0000_s2069" type="#_x0000_t136" style="position:absolute;left:0;text-align:left;margin-left:${marginLeft}pt;margin-top:-4.2pt;width:${width}pt;height:51pt;z-index:3;mso-position-horizontal-relative:text;mso-position-vertical-relative:text" fillcolor="red" strokecolor="red"><v:shadow color="#868686"/><v:textpath style="font-family:&quot;华文中宋&quot;;font-weight:bold;v-text-kern:t" trim="t" fitpath="t" string="${escapeXml(issuer)}"/></v:shape></w:pict>`;
  const fine = `<w:pict>${RED_LINE_FINE}</w:pict>`;
  const thick = `<w:pict>${RED_LINE_THICK}</w:pict>`;
  return [
    '<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="方正粗宋简体" w:fareast="方正粗宋简体"/><wx:font wx:val="方正粗宋简体"/><w:b/><w:color w:val="FF0000"/><w:sz w:val="76"/><w:sz-cs w:val="76"/></w:rPr></w:pPr>',
    `<w:r><w:rPr><w:rFonts w:ascii="仿宋_GB2312" w:fareast="仿宋_GB2312"/><wx:font wx:val="仿宋_GB2312"/><w:noProof/><w:sz w:val="32"/></w:rPr>${artText}</w:r>`,
    `<w:r><w:rPr><w:rFonts w:ascii="方正粗宋简体" w:fareast="方正粗宋简体"/><wx:font wx:val="方正粗宋简体"/><w:noProof/><w:sz w:val="76"/><w:sz-cs w:val="76"/></w:rPr>${fine}</w:r>`,
    `<w:r><w:rPr><w:rFonts w:ascii="方正粗宋简体" w:fareast="方正粗宋简体"/><wx:font wx:val="方正粗宋简体"/><w:noProof/><w:sz w:val="76"/><w:sz-cs w:val="76"/></w:rPr>${thick}</w:r>`,
    "</w:p>",
  ].join("");
}

function run(text, fonts = "仿宋_GB2312", options = {}) {
  const bold = options.bold ? "<w:b/>" : "";
  const size = options.size ? `<w:sz w:val="${options.size}"/><w:sz-cs w:val="${options.size}"/>` : "";
  const hAnsi = options.hAnsi ? ` w:h-ansi="${fonts}"` : "";
  return `<w:r><w:rPr><w:rFonts w:ascii="${fonts}"${hAnsi} w:fareast="${fonts}"/><wx:font wx:val="${fonts}"/>${bold}${size}<w:noProof/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>`;
}

const BODY_RPR = '<w:rPr><w:rFonts w:ascii="仿宋_GB2312" w:fareast="仿宋_GB2312"/><wx:font wx:val="仿宋_GB2312"/><w:sz w:val="32"/></w:rPr>';

// 样板 P2/P4/P6 空行段（right=654）。
function blankLine() {
  return '<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="654"/><w:jc w:val="left"/>' + BODY_RPR + '</w:pPr></w:p>';
}

// 发文字号段：3 号仿宋，居右空一字（用户规范）。
function documentNumberParagraph(text) {
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="320"/><w:jc w:val="right"/>${BODY_RPR}</w:pPr><w:r>${BODY_RPR}<w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

// 标题段：方正小标宋体 2 号（44），居中（用户规范）。
function titleParagraph(text) {
  const rPr = '<w:rPr><w:rFonts w:ascii="方正小标宋简体" w:fareast="方正小标宋简体"/><wx:font wx:val="方正小标宋简体"/><w:sz w:val="44"/><w:sz-cs w:val="44"/></w:rPr>';
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="654"/><w:jc w:val="center"/>${rPr}</w:pPr><w:r>${rPr}<w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

// 主送段（顶格，right=654）。
function recipientParagraph(text) {
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="654"/><w:jc w:val="left"/>${BODY_RPR}</w:pPr><w:r>${BODY_RPR}<w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

// 正文段：3 号仿宋，首行左空二字（first-line-chars=200），回行顶格。
function bodyParagraph(text, fonts = "仿宋_GB2312", options = {}) {
  const bold = options.bold ? "<w:b/>" : "";
  const hAnsi = options.hAnsi ? `<w:rFonts w:ascii="${fonts}" w:h-ansi="${fonts}" w:fareast="${fonts}"/>` : `<w:rFonts w:ascii="${fonts}" w:fareast="${fonts}"/>`;
  const rPr = `<w:rPr>${hAnsi}<wx:font wx:val="${fonts}"/>${bold}<w:sz w:val="32"/></w:rPr>`;
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="-81" w:first-line-chars="200" w:first-line="640"/><w:jc w:val="left"/>${rPr}</w:pPr><w:r>${rPr}<w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

// 成文日期段：阿拉伯数字，居右空 4 字（用户规范）。
function dateParagraph(dateText) {
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="640"/><w:jc w:val="right"/>${BODY_RPR}</w:pPr><w:r>${BODY_RPR}<w:t>${escapeXml(dateText)}</w:t></w:r></w:p>`;
}

// 发文机关署名段：在成文日期之上，以成文日期为准居中编排（动态右缩进对齐）。
function signParagraph(issuer, dateText) {
  const dateUnits = textWidthUnits(dateText);
  const issuerUnits = textWidthUnits(issuer);
  const rightIndent = Math.max(320, Math.round(640 + (dateUnits - issuerUnits) * 16));
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="${rightIndent}"/><w:jc w:val="right"/>${BODY_RPR}</w:pPr><w:r>${BODY_RPR}<w:t>${escapeXml(issuer)}</w:t></w:r></w:p>`;
}

// ===== 层次序号（一、/（一）/1./（1））与字体（黑体/楷体/仿宋/仿宋）=====

function levelMarker(level, index) {
  switch (level) {
    case 0: return `${CN_NUMERALS[index] ?? String(index + 1)}、`;
    case 1: return `（${CN_NUMERALS[index] ?? String(index + 1)}）`;
    case 2: return `${index + 1}. `;
    default: return `（${index + 1}）`;
  }
}

function renderNestedItems(items, level) {
  const out = [];
  (items ?? []).forEach((item, index) => {
    const text = typeof item === "string" ? item : item?.title ?? "";
    if (!text) return;
    const fonts = level === 1 ? "楷体_GB2312" : "仿宋_GB2312";
    const bold = level === 1;
    out.push(bodyParagraph(`${levelMarker(level, index)}${text}`, fonts, { bold }));
    if (typeof item === "object" && Array.isArray(item.items) && item.items.length) {
      out.push(renderNestedItems(item.items, level + 1));
    }
  });
  return out.join("\n");
}

function renderSections(sections) {
  const out = [];
  sections.forEach((section, index) => {
    out.push(bodyParagraph(`${levelMarker(0, index)}${section.title}`, "黑体", { bold: true }));
    if (section.items?.length) out.push(renderNestedItems(section.items, 1));
    for (const paragraphText of section.paragraphs ?? []) out.push(bodyParagraph(paragraphText));
  });
  return out.join("\n");
}

// ===== 附件说明：左空二字、全角冒号、阿拉伯数字编号、回行对齐名称首字 =====

function attachmentParagraph(index, name) {
  const label = index === 0 ? "附件：" : "";
  const number = `${index + 1}. `;
  // 悬挂缩进：首行左空 2 字，回行左空 6 字与附件名称首字对齐。
  return `<w:p><w:pPr><w:snapToGrid w:val="off"/><w:spacing w:line="560" w:line-rule="exact"/><w:ind w:right="654" w:left="1920" w:hanging="1280"/><w:jc w:val="left"/>${BODY_RPR}</w:pPr><w:r>${BODY_RPR}<w:t>${escapeXml(label)}</w:t></w:r><w:r>${BODY_RPR}<w:t>${escapeXml(number)}</w:t></w:r><w:r>${BODY_RPR}<w:t>${escapeXml(name)}</w:t></w:r></w:p>`;
}

function renderAttachments(attachments) {
  const list = (attachments ?? []).filter(Boolean);
  if (!list.length) return "";
  return `${blankLine()}\n${list.map((name, index) => attachmentParagraph(index, name)).join("\n")}`;
}

// ===== 版记（样板独立文本框形式：v:group 组合，双横线间距 624 twips）=====
// 结构完全复刻纪委样板：矩形类型 t202 + 上方定位框 s2071 + 上横线 s2072
// （y=13330）+ 下横线 s2073（y=13954）+ 部门名称文本框 s2074 + 印发日期
// 文本框 s2075，全部绝对定位（水平 margin 相对、垂直 page 相对），文字 4 号。

const RECT_SHAPETYPE = '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>';
const COLOPHON_SPACER = '<v:shape id="_x0000_s2071" type="#_x0000_t202" style="position:absolute;left:1483;top:12706;width:8190;height:567;visibility:visible;mso-position-vertical-relative:page" filled="f" stroked="f"><v:textbox style="mso-next-textbox:#_x0000_s2071" inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:pStyle w:val="a4"/><w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体"/></w:rPr></w:pPr></w:p></w:txbxContent></v:textbox></v:shape>';
const COLOPHON_LINE_TOP = '<v:line id="_x0000_s2072" style="position:absolute;mso-position-horizontal-relative:margin;mso-position-vertical-relative:page" from="1483,13330" to="10327,13330"/>';
const COLOPHON_LINE_BOTTOM = '<v:line id="_x0000_s2073" style="position:absolute;mso-position-horizontal-relative:margin;mso-position-vertical-relative:page" from="1483,13954" to="10327,13954"/>';

function colophonOffice(issuer) {
  return /办公室$/u.test(issuer) ? issuer : `${issuer}办公室`;
}

// 部门名称文本框（左，贴住上横线 top=13330；内部 a4 + 左空一字 + 4 号，禁换行）。
function colophonOfficeBox(shapeId, office, width) {
  const content = `<w:p><w:pPr><w:pStyle w:val="a4"/><w:wordWrap w:val="off"/><w:ind w:firstLine="320"/><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:hint="eastAsia"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${escapeXml(office)}</w:t></w:r></w:p>`;
  return `<v:shape id="_x0000_${shapeId}" type="#_x0000_t202" style="position:absolute;left:1483;top:13330;width:${width};height:567;mso-position-vertical-relative:page" filled="f" stroked="f"><v:textbox style="mso-next-textbox:#_x0000_${shapeId}" inset="0,0,0,0"><w:txbxContent>${content}</w:txbxContent></v:textbox></v:shape>`;
}

// 印发日期文本框（右，贴住上横线；内部居右空一字 + 4 号仿宋，禁换行，
// 保证“印发”完整显示）。
function colophonDateBox(shapeId, printed, width) {
  const content = `<w:p><w:pPr><w:wordWrap w:val="off"/><w:ind w:right="320"/><w:jc w:val="right"/><w:rPr><w:rFonts w:ascii="仿宋_GB2312" w:eastAsia="仿宋_GB2312"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="仿宋_GB2312" w:eastAsia="仿宋_GB2312" w:hint="eastAsia"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${escapeXml(printed)}</w:t></w:r></w:p>`;
  const left = 10327 - width;
  return `<v:shape id="_x0000_${shapeId}" type="#_x0000_t202" style="position:absolute;left:${left};top:13330;width:${width};height:567;mso-position-vertical-relative:page" filled="f" stroked="f"><v:textbox style="mso-next-textbox:#_x0000_${shapeId}" inset="0,0,0,0"><w:txbxContent>${content}</w:txbxContent></v:textbox></v:shape>`;
}

function renderColophon(draft, date) {
  const office = colophonOffice(draft.issuer);
  const printed = `${chineseDate(date)}印发`;
  // 文本框宽度按文字自适应并留足安全余量（4 号字 280twips/字 + 600twips），
  // 内部段落禁用自动换行（wordWrap off），确保“印发”完整显示、不被换行裁切。
  const officeWidth = Math.round(Math.max(2800, textWidthUnits(office) * 280 + 600));
  const dateWidth = Math.round(Math.max(2600, textWidthUnits(printed) * 280 + 600));
  // 垂直定位固定为相对页面（page）：上横线显示在页面 700pt 处（文字区底 742.65pt 之内、
  // 页码 754.15pt 之上），不再随锚点段落位置漂移，杜绝版记掉出下页边距或页码跑到版记上方。
  // margin-top = 700 - 31.2（组内逻辑 12706→13330 的映射偏移）= 668.8pt。
  return `<w:p><w:pPr><w:spacing w:line="240" w:line-rule="exact"/><w:jc w:val="left"/></w:pPr><w:r><w:pict><v:group id="_x0000_s2070" style="position:absolute;left:0;text-align:left;margin-left:0;margin-top:668.8pt;width:443.35pt;height:62.4pt;z-index:-1;mso-position-vertical-relative:page" coordorigin="1483,12706" coordsize="8867,1248">${RECT_SHAPETYPE}${COLOPHON_SPACER}${COLOPHON_LINE_TOP}${COLOPHON_LINE_BOTTOM}${colophonOfficeBox("s2074", office, officeWidth)}${colophonDateBox("s2075", printed, dateWidth)}</v:group></w:pict></w:r></w:p>`;
}

function renderBody(draft, date) {
  const parts = [];
  parts.push(redHeaderParagraph(draft.issuer));
  parts.push(blankLine());
  parts.push(documentNumberParagraph(draft.documentNumber));
  parts.push(blankLine());
  parts.push(titleParagraph(draft.title));
  parts.push(blankLine());
  parts.push(recipientParagraph(draft.recipient));
  parts.push(bodyParagraph(draft.lead));
  parts.push(renderSections(draft.sections));
  parts.push(bodyParagraph(draft.closing));
  parts.push(renderAttachments(draft.attachments));
  parts.push(blankLine());
  parts.push(blankLine());
  parts.push(signParagraph(draft.issuer, chineseDate(date)));
  parts.push(dateParagraph(chineseDate(date)));
  parts.push(renderColophon(draft, date));
  return parts.join("\n");
}

export async function loadSkeleton() {
  const url = new URL("../templates/document-skeleton.xml", import.meta.url);
  const template = await readFile(url, "utf8");
  const dirty = /<(?:w:txbxContent|v:textbox|aml:annotation|w:commentRangeStart|w:comment)\b/iu.test(template);
  if (dirty) throw new Error("模板骨架包含禁止的文本框或批注，拒绝加载");
  if (!template.includes(BODY_MARKER)) throw new Error("模板骨架缺少 body 注入占位符");
  return template;
}

export async function renderDocument(draft, options = {}) {
  const date = options.date instanceof Date ? options.date : new Date();
  const safeTitle = escapeXml(sanitizeText(draft.title, "办理情况通报"));
  const safeIssuer = escapeXml(sanitizeText(draft.issuer, "发文机关"));
  const template = await loadSkeleton();
  const [head, tail] = template.split(BODY_MARKER);
  const header = head
    .replace("__HONDTOU_TITLE__", safeTitle)
    .replace("__HONDTOU_ISSUER__", safeIssuer)
    .replace("__HONDTOU_CREATED__", date.toISOString());
  return `${header}${renderBody(draft, date)}${tail}`;
}

export function validateGeneratedXml(xml) {
  const failures = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"')) failures.push("缺少 UTF-8 XML 声明");
  if (!xml.includes("<w:wordDocument")) failures.push("缺少 Word 2003 XML 根节点");
  if (!xml.includes('<w:pgMar w:top="2098" w:right="1474" w:bottom="1985" w:left="1588"')) failures.push("页边距不符合样板版心");
  if (!/<v:line\b[^>]*strokecolor="red"/iu.test(xml)) failures.push("缺少红色分割线");
  if (!/<v:line\b[^>]*strokeweight="3pt"/iu.test(xml)) failures.push("缺少粗红线（3pt）");
  if (!/<v:line\b[^>]*strokeweight="1.5pt"/iu.test(xml)) failures.push("缺少细红线（1.5pt）");
  if (!/<w:rFonts w:ascii="方正小标宋简体"[^>]*\/><wx:font wx:val="方正小标宋简体"\/><w:sz w:val="44"/u.test(xml)) failures.push("标题不是方正小标宋体 2 号");
  if (!/<w:ind w:right="320"\/><w:jc w:val="right"/u.test(xml)) failures.push("发文字号未居右空一字");
  if (!/<w:ind w:right="640"\/><w:jc w:val="right"/u.test(xml)) failures.push("成文日期未居右空 4 字");
  if (!/<w:instrText>[^<]*PAGE/u.test(xml)) failures.push("缺少自动页码域（PAGE）");
  if (/—\s*[0-9]+\s*—/u.test(xml.replace(/<[^>]*>/gu, ""))) failures.push("存在静态页码文本（应为 PAGE 域自动页码）");
  if (!/from="1483,13330" to="10327,13330"/u.test(xml)) failures.push("缺少版记上横线");
  if (!/from="1483,13954" to="10327,13954"/u.test(xml)) failures.push("缺少版记下横线");
  if (!/_x0000_s2074/u.test(xml) || !/_x0000_s2075/u.test(xml)) failures.push("版记未采用独立文本框形式");
  if (!/印发/u.test(xml)) failures.push("缺少版记印发日期");
  if (/<(?:aml:annotation|w:commentRangeStart|w:comment)\b/iu.test(xml)) failures.push("包含禁止的批注");
  if (/(正文用3号仿宋体字|如有多个附件|半角宋体阿拉伯数字|发文机关署名在成文日期之上|“附件”二字)/u.test(xml)) failures.push("包含模板教学说明文本框");
  if (/(xxxx|×{2,}|（空一行）|（空两格）|（此处|（略）|（下略）)/iu.test(xml)) failures.push("包含禁止的占位符或排版动作字符");
  if (/[#*`]|\]\(/u.test(xml.replace(/<[^>]*>/gu, ""))) failures.push("正文残留 Markdown 语法符号");
  if (xml.includes("<!--")) failures.push("最终文档不得包含注释");
  return failures;
}
