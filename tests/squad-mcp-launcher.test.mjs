import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const launcher = new URL("../hooks/squad-mcp.mjs", import.meta.url).pathname;

function setup(mcpEnv) {
  const repo = mkdtempSync(join(tmpdir(), "squad-launcher-"));
  mkdirSync(join(repo, ".claude/hooks"), { recursive: true });
  cpSync(launcher, join(repo, ".claude/hooks/squad-mcp.mjs"));
  for (const name of ["fallback", "real"])
    writeFileSync(join(repo, `${name}.mjs`), `console.log("ran-${name}");\n`);
  if (mcpEnv)
    writeFileSync(
      join(repo, ".mcp.json"),
      JSON.stringify({ mcpServers: { squad: { env: mcpEnv } } }),
    );
  return repo;
}

function run(repo, env) {
  const clean = { ...process.env };
  delete clean.SQUAD_RUNTIME;
  delete clean.SQUAD_DIR;
  delete clean.SQUAD_HOME;
  // Never let the default release location reach the real home directory.
  return spawnSync(process.execPath, [join(repo, ".claude/hooks/squad-mcp.mjs")], {
    encoding: "utf8",
    cwd: repo,
    env: { ...clean, HOME: join(repo, "no-home"), ...env },
  });
}

test("env set: real env value wins over .mcp.json", () => {
  const repo = setup({ SQUAD_RUNTIME: "fallback.mjs" });
  const r = run(repo, { SQUAD_RUNTIME: "real.mjs" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ran-real/);
});

test("env unset: falls back to .mcp.json, relative to repo root", () => {
  const repo = setup({ SQUAD_RUNTIME: "fallback.mjs" });
  const r = run(repo, {});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ran-fallback/);
});

test("neither source and no release install: names the default path it looked for", () => {
  for (const repo of [setup(null), setup({ OTHER: "x" })]) {
    const r = run(repo, {});
    assert.equal(r.status, 1);
    assert.match(r.stderr, /MCP runtime not found/);
    assert.ok(
      r.stderr.includes(join(repo, "no-home/.local/share/squad/current/dist/index.js")),
      r.stderr,
    );
  }
});

function releaseAt(root) {
  mkdirSync(join(root, "current/dist"), { recursive: true });
  writeFileSync(join(root, "current/dist/index.js"), 'console.log("ran-release");\n');
}

test("neither source: defaults to ~/.local/share/squad/current of the running user (#347)", () => {
  const repo = setup({ SQUAD_DIR: ".squad" });
  releaseAt(join(repo, "no-home/.local/share/squad"));
  const r = run(repo, {});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ran-release/);
});

test("neither source: SQUAD_HOME relocates the default release install (#347)", () => {
  const repo = setup(null);
  releaseAt(join(repo, "custom-home"));
  const r = run(repo, { SQUAD_HOME: join(repo, "custom-home") });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ran-release/);
});

test("explicit env and .mcp.json values still beat the release default (#347)", () => {
  const repo = setup({ SQUAD_RUNTIME: "fallback.mjs" });
  releaseAt(join(repo, "no-home/.local/share/squad"));
  assert.match(run(repo, {}).stdout, /ran-fallback/);
  assert.match(run(repo, { SQUAD_RUNTIME: "real.mjs" }).stdout, /ran-real/);
});

test("partial: SQUAD_RUNTIME from env, SQUAD_DIR from .mcp.json", () => {
  const repo = setup({ SQUAD_RUNTIME: "fallback.mjs", SQUAD_DIR: ".squad-room" });
  writeFileSync(
    join(repo, "real.mjs"),
    `console.log("ran-real"); console.log("dir=" + process.env.SQUAD_DIR);\n`,
  );
  const r = run(repo, { SQUAD_RUNTIME: "real.mjs" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ran-real/);
  // The fallback relative SQUAD_DIR is anchored to the repo root, not the cwd.
  assert.match(r.stdout, /^dir=\/.*[\\/]\.squad-room$/m);
});

test("startup diagnostic goes to stderr, stdout stays the runtime's", () => {
  const repo = setup({ SQUAD_RUNTIME: "real.mjs" });
  const r = run(repo, {});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "ran-real\n");
  assert.match(r.stderr, /squad: starting MCP runtime .*real\.mjs \(node v[\d.]+, SQUAD_DIR=\(unset\)\)/);
});

test("runtime that throws on import: names the step and exits 1", () => {
  const repo = setup({ SQUAD_RUNTIME: "real.mjs" });
  writeFileSync(join(repo, "real.mjs"), `throw new Error("boom");\n`);
  const r = run(repo, {});
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /squad: failed to load MCP runtime .*real\.mjs: boom/);
});

test("missing runtime: existing message unchanged", () => {
  const repo = setup({ SQUAD_RUNTIME: "nope.mjs" });
  const r = run(repo, {});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /MCP runtime not found; looked for/);
});
