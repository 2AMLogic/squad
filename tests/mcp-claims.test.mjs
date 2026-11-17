import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("squad_claims hides stale claims by default, reports the omitted count, and filters by prefix", async () => {
  const room = mkdtempSync(join(tmpdir(), "squad-mcp-claims-"));
  const clients = [];
  async function connect() {
    const env = {
      ...process.env,
      SQUAD_DIR: room,
      SQUAD_PROVIDER: "openai",
      SQUAD_MODEL: "gpt-6",
    };
    delete env.SQUAD_PERSONA;
    delete env.SQUAD_SESSION_ID;
    const client = new Client({ name: "claims-test", version: "1" });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve("dist/index.js")],
        env,
        stderr: "pipe",
      }),
    );
    return client;
  }
  const call = async (client, name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  try {
    const live = await connect();
    const departing = await connect();
    const liveJoin = await call(live, "squad_join");
    const departingJoin = await call(departing, "squad_join");

    // No claims at all.
    assert.deepEqual(await call(live, "squad_claims"), { claims: [], stale_omitted: 0 });

    await call(live, "squad_claim", { path: "src/live.ts" });
    await call(departing, "squad_claim", { path: "src/gone.ts" });
    await call(departing, "squad_claim", { path: "docs/gone.md" });
    await call(departing, "squad_leave");

    // Default: only the live holder's claim; both stale ones are counted.
    const byDefault = await call(live, "squad_claims");
    assert.deepEqual(
      byDefault.claims.map((c) => c.path),
      ["src/live.ts"],
    );
    assert.equal(byDefault.claims[0].persona, liveJoin.persona);
    assert.equal(byDefault.claims[0].stale, false);
    assert.equal(byDefault.stale_omitted, 2);

    // include_stale returns everything and omits nothing.
    const all = await call(live, "squad_claims", { include_stale: true });
    assert.deepEqual(all.claims.map((c) => c.path).sort(), [
      "docs/gone.md",
      "src/gone.ts",
      "src/live.ts",
    ]);
    assert.equal(all.stale_omitted, 0);
    assert.ok(all.claims.filter((c) => c.stale).every((c) => c.persona === departingJoin.persona));

    // path_prefix, default mode: stale_omitted describes the prefixed query only.
    const srcDefault = await call(live, "squad_claims", { path_prefix: "src/" });
    assert.deepEqual(
      srcDefault.claims.map((c) => c.path),
      ["src/live.ts"],
    );
    assert.equal(srcDefault.stale_omitted, 1);

    // path_prefix, include_stale mode.
    const srcAll = await call(live, "squad_claims", { path_prefix: "src/", include_stale: true });
    assert.deepEqual(srcAll.claims.map((c) => c.path).sort(), ["src/gone.ts", "src/live.ts"]);
    assert.equal(srcAll.stale_omitted, 0);

    // Prefix matching only stale claims: empty claims, non-zero stale_omitted.
    assert.deepEqual(await call(live, "squad_claims", { path_prefix: "docs/" }), {
      claims: [],
      stale_omitted: 1,
    });

    // Prefix matching nothing.
    assert.deepEqual(await call(live, "squad_claims", { path_prefix: "nope/" }), {
      claims: [],
      stale_omitted: 0,
    });
  } finally {
    await Promise.allSettled(clients.map((c) => c.close()));
    rmSync(room, { recursive: true, force: true });
  }
});
