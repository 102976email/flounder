import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSource } from "../dist/ingest/source.js";

test("source ingest: paths follow the sandbox build root for external projects", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "flounder-source-root-"));
  const project = path.join(base, "sample-project");
  const scoped = path.join(project, "core", "contracts");
  await mkdir(scoped, { recursive: true });
  await writeFile(path.join(scoped, "Pool.sol"), "contract Pool {}\n");
  try {
    const docs = await loadSource([scoped], { publicRoot: project });
    assert.deepEqual(docs.map((doc) => doc.path), ["core/contracts/Pool.sol"]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("source ingest: Clarity (.clar) files are collected", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "flounder-source-clar-"));
  const project = path.join(base, "sample-project");
  await mkdir(path.join(project, "contracts"), { recursive: true });
  await writeFile(
    path.join(project, "contracts", "stacking.clar"),
    "(define-public (stack (amount uint)) (ok amount))\n",
  );
  try {
    const docs = await loadSource([project], { publicRoot: project });
    assert.deepEqual(docs.map((doc) => doc.path), ["contracts/stacking.clar"]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("source ingest: Foundry lib/ dependencies stay out of the corpus", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "flounder-source-foundry-"));
  const project = path.join(base, "sample-foundry");
  await mkdir(path.join(project, "src"), { recursive: true });
  await mkdir(path.join(project, "lib", "forge-std", "src"), { recursive: true });
  await mkdir(path.join(project, "out", "Vault.sol"), { recursive: true });
  await mkdir(path.join(project, "cache"), { recursive: true });
  await writeFile(path.join(project, "foundry.toml"), "[profile.default]\nsrc = \"src\"\nout = \"out\"\n");
  await writeFile(path.join(project, "src", "Vault.sol"), "contract Vault {}\n");
  await writeFile(path.join(project, "lib", "forge-std", "src", "Test.sol"), "contract Test {}\n");
  await writeFile(path.join(project, "out", "Vault.sol", "Vault.json"), "{}\n");
  await writeFile(path.join(project, "cache", "solidity-files-cache.json"), "{}\n");
  try {
    const docs = await loadSource([project], { publicRoot: project });
    const paths = docs.map((doc) => doc.path);
    assert.ok(paths.some((p) => p.endsWith("Vault.sol")), `expected Vault.sol in ${JSON.stringify(paths)}`);
    assert.ok(!paths.some((p) => p.includes("lib/")), `lib/ leaked into corpus: ${JSON.stringify(paths)}`);
    assert.ok(!paths.some((p) => p.includes("out/")), `out/ leaked into corpus: ${JSON.stringify(paths)}`);
    assert.ok(!paths.some((p) => p.includes("cache/")), `cache/ leaked into corpus: ${JSON.stringify(paths)}`);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("source ingest: lib/ is kept for non-Foundry projects", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "flounder-source-lib-"));
  const project = path.join(base, "sample-app");
  await mkdir(path.join(project, "lib"), { recursive: true });
  await writeFile(path.join(project, "lib", "helpers.py"), "def helper():\n    return 1\n");
  try {
    const docs = await loadSource([project], { publicRoot: project });
    const paths = docs.map((doc) => doc.path);
    assert.ok(paths.some((p) => p.endsWith("helpers.py")), `lib/ was dropped for a non-Foundry project: ${JSON.stringify(paths)}`);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
