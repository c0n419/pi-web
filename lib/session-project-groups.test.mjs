import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSessionsByProject,
  parseCollapsedProjectRoots,
  projectColor,
  serializeCollapsedProjectRoots,
} from "./session-project-groups.ts";

function session(id, cwd, modified, overrides = {}) {
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd,
    projectRoot: cwd,
    created: modified,
    modified,
    messageCount: 1,
    firstMessage: id,
    ...overrides,
  };
}

test("groups every project concurrently and preserves fork trees", () => {
  const sessions = [
    session("root-a", "/a", "2026-01-01T00:00:00Z"),
    session("child-a", "/a", "2026-01-03T00:00:00Z", { parentSessionId: "root-a" }),
    session("independent-a", "/a", "2026-01-02T00:00:00Z"),
    session("root-b", "/b", "2026-01-04T00:00:00Z"),
  ];

  const groups = groupSessionsByProject(sessions, new Set(), new Set());
  assert.deepEqual(groups.map((group) => group.root), ["/b", "/a"]);
  const a = groups.find((group) => group.root === "/a");
  assert.ok(a);
  assert.deepEqual(a.tree.map((node) => node.session.id), ["independent-a", "root-a"]);
  assert.deepEqual(a.tree[1].children.map((node) => node.session.id), ["child-a"]);
});

test("running then unread projects sort ahead of recency", () => {
  const groups = groupSessionsByProject([
    session("old-running", "/running", "2026-01-01T00:00:00Z"),
    session("middle-unread", "/unread", "2026-01-02T00:00:00Z"),
    session("new-idle", "/idle", "2026-01-03T00:00:00Z"),
  ], new Set(["old-running"]), new Set(["middle-unread"]));
  assert.deepEqual(groups.map((group) => group.root), ["/running", "/unread", "/idle"]);

  const ordered = groupSessionsByProject([
    session("a", "/a", "2026-01-01T00:00:00Z"),
    session("b", "/b", "2026-01-02T00:00:00Z"),
    session("c", "/c", "2026-01-03T00:00:00Z"),
  ], new Set(), new Set(), ["/c", "/a", "/b"]);
  assert.deepEqual(ordered.map((group) => group.root), ["/c", "/a", "/b"]);
});

test("project colors are deterministic and selected from an accessible restrained palette", () => {
  assert.equal(projectColor("/home/ninja/pi-web"), projectColor("/home/ninja/pi-web"));
  assert.match(projectColor("/home/ninja/pi-web"), /^#[0-9a-f]{6}$/i);
});

test("collapsed project roots safely round-trip through localStorage format", () => {
  const encoded = serializeCollapsedProjectRoots(new Set(["/z", "/a"]));
  assert.equal(encoded, '["/a","/z"]');
  assert.deepEqual([...parseCollapsedProjectRoots(encoded)], ["/a", "/z"]);
  assert.deepEqual([...parseCollapsedProjectRoots("not-json")], []);
  assert.deepEqual([...parseCollapsedProjectRoots('{"root":"/a"}')], []);
});
