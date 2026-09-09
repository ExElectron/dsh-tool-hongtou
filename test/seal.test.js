import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { resolveSeal } from "../lib/index.js";

// 测试期间隔离环境变量，避免外部 HONDTOU_SEAL 影响默认分支。
delete process.env.HONDTOU_SEAL;

test("resolveSeal 解析绝对路径、相对路径与关闭开关", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hongtou-seal-"));
  const sealPath = join(dir, "seal.png");
  await writeFile(sealPath, "png");
  try {
    assert.equal(await resolveSeal(dir, { seal: false }), null);
    assert.equal(await resolveSeal(dir, { seal: "off" }), null);
    assert.equal(await resolveSeal(dir, { seal: sealPath }), sealPath);
    assert.equal(await resolveSeal(dir, { seal: "seal.png" }), sealPath);
    assert.equal(await resolveSeal(dir, { seal: "./seal.png" }), sealPath);
    assert.equal(await resolveSeal(dir, { seal: "missing.png" }), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveSeal 默认返回插件内置印章", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hongtou-seal-"));
  try {
    const builtin = await resolveSeal(dir, {});
    assert.ok(builtin);
    assert.ok(isAbsolute(builtin));
    assert.ok(builtin.endsWith(join("assets", "seal-default.png")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveSeal 展开 ~ 前缀", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hongtou-seal-"));
  try {
    assert.equal(await resolveSeal(dir, { seal: "~" }), homedir());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
