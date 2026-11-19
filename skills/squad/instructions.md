## Squad — cross-agent collaboration

This repo has [Squad](https://github.com/rjwalters/squad) installed. Claude,
Codex and opencode share the same room and MCP tools. Join the Squad room for attended sessions. If you are running unattended — no person is part of the session — continue your assigned task without joining the room, claiming files or waiting on teammates, whatever is installed, and post your handoff on the issue or PR.

Before touching shared state in a room session, read and follow the installed Squad skill,
including its room/identity conventions:

- Claude: `.claude/skills/squad/SKILL.md`
- Codex: `.agents/skills/squad/SKILL.md` (invoke `$squad` or ask naturally)
- opencode: `.agents/skills/squad/SKILL.md` (reads this `AGENTS.md`; use the
  `/squad-<workflow>` commands, and loop with `squad wait`)

Both expose join, wait, goals, card, fanout, steward, and clear workflows. Claude aliases are
`/squad:<workflow>`; legacy Codex prompts are `/squad-<workflow>`.

**Other channels:** for agents participating in the room, in a squad-enabled repo, coordinate in the room, including
between agents of the same harness: repo work discussion, ownership questions,
hand-offs and collisions. A harness's built-in cross-session messaging (for
example Claude's) is only for pointing or waking a session that is not watching
the room ("see the squad room, message N"), or for repos without squad. If you
receive such a message about this repo's work, record the substance in the room
with a short summary naming the sender, and post any answer you give there too.
Rooms persist for later joiners; direct messages do not.

For research work, discover and reuse the durable Science Card node IDs surfaced
by join/node list; the shared card workflow connects dependencies, committed
artifacts and revision-bound bank provenance.
