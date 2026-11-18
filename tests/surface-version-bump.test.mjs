import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-surface-version-bump.sh");
const scratch = mkdtempSync(join(tmpdir(), "squad-surface-bump-"));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

const GIT_ARGS = ["-c", "user.email=test@example.com", "-c", "user.name=test"];

function git(cwd, args) {
  const r = spawnSync("git", [...GIT_ARGS, ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function fixture(name) {
  const repo = join(scratch, name);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/mcp.ts"), "export const version = '0';\n");
  writeFileSync(join(repo, "README.md"), "doc\n");
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "init"]);
  return repo;
}

function check(repo, base, head, env = {}) {
  return spawnSync("bash", [SCRIPT, "--base", base, "--head", head], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("failure text names the commit message as the queue-safe marker place", () => {
  const repo = fixture("failtext");
  writeFileSync(join(repo, "src/mcp.ts"), "export const version = '1';\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "change watched surface"]);
  const base = git(repo, ["rev-parse", "HEAD~1"]);
  const r = check(repo, base, "HEAD");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const text = r.stderr + r.stdout;
  assert.match(text, /commit message/);
  assert.match(text, /queue-safe/);
  assert.doesNotMatch(text, /PR body or to a commit/);
});

test("commit-message marker still exempts (exit 0)", () => {
  const repo = fixture("commit-marker");
  writeFileSync(join(repo, "src/mcp.ts"), "export const version = '2';\n");
  git(repo, ["add", "-A"]);
  git(repo, [
    "commit",
    "-q",
    "-m",
    "refactor\n\n<!-- loom:no-surface-change -->",
  ]);
  const base = git(repo, ["rev-parse", "HEAD~1"]);
  assert.equal(check(repo, base, "HEAD").status, 0);
});

test("PR body marker still exempts when PR_BODY is set (exit 0)", () => {
  const repo = fixture("pr-body-marker");
  writeFileSync(join(repo, "src/mcp.ts"), "export const version = '3';\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "no marker in message"]);
  const base = git(repo, ["rev-parse", "HEAD~1"]);
  assert.equal(
    check(repo, base, "HEAD", {
      PR_BODY: "desc\n<!-- loom:no-surface-change -->",
    }).status,
    0,
  );
});

test("no watched-surface change exits 0 without a marker", () => {
  const repo = fixture("unwatched");
  writeFileSync(join(repo, "README.md"), "doc change\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "docs only"]);
  const base = git(repo, ["rev-parse", "HEAD~1"]);
  assert.equal(check(repo, base, "HEAD").status, 0);
});

test("--help renders the full header through the exit codes", () => {
  const r = spawnSync("bash", [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const text = r.stdout + r.stderr;
  assert.match(text, /path is still accepted wherever PR_BODY is set/);
  assert.match(text, /Exit codes:/);
  assert.match(text, /2 - bad usage \(missing\/invalid --base or --head\)/);
});
