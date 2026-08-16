import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SESSION_PANES,
  addWorkspacePane,
  closeWorkspacePane,
  createPaneDescriptor,
  createPaneWorkspace,
  focusWorkspacePane,
  normalizePaneWorkspace,
  parsePaneWorkspace,
  removeSessionFromWorkspace,
  replaceFocusedPane,
  serializePaneWorkspace,
  setPaneLabel,
  swapWorkspacePanes,
  toggleMaximizePane,
  setLayoutPreset,
} from "./session-pane-workspace.ts";

const pane = (id, sessionId = null, cwd = `/work/${id}`) => createPaneDescriptor(id, { sessionId, cwd, draftId: `draft-${id}` });

test("workspace adds, focuses, closes, and clamps panes to four", () => {
  let state = createPaneWorkspace(pane("p1", "s1"));
  state = addWorkspacePane(state, pane("p2", "s2"));
  state = addWorkspacePane(state, pane("p3", "s3"));
  state = addWorkspacePane(state, pane("p4", "s4"));
  state = addWorkspacePane(state, pane("p5", "s5"));
  assert.equal(state.panes.length, MAX_SESSION_PANES);
  assert.equal(state.focusedPaneId, "p4");

  state = focusWorkspacePane(state, "p2");
  state = closeWorkspacePane(state, "p2", pane("fallback"));
  assert.deepEqual(state.panes.map((item) => item.id), ["p1", "p3", "p4"]);
  assert.equal(state.focusedPaneId, "p3");
});

test("saved sessions are unique and selecting an open session focuses its pane", () => {
  let state = createPaneWorkspace(pane("p1", "s1"));
  state = addWorkspacePane(state, pane("p2", "s2"));
  const unchanged = addWorkspacePane(state, pane("p3", "s1"));
  assert.equal(unchanged.panes.length, 2);
  assert.equal(unchanged.focusedPaneId, "p1");

  const selected = replaceFocusedPane(state, { sessionId: "s1", cwd: "/work/p1", draftId: "ignored" });
  assert.equal(selected.focusedPaneId, "p1");
  assert.deepEqual(selected.panes.map((item) => item.sessionId), ["s1", "s2"]);
});

test("normalization repairs focus, dedupes sessions, clamps and rejects corruption", () => {
  assert.equal(parsePaneWorkspace("not-json"), null);
  assert.equal(normalizePaneWorkspace({ version: 2, panes: [] }), null);
  const state = normalizePaneWorkspace({
    version: 1,
    focusedPaneId: "missing",
    panes: [
      pane("p1", "s1"),
      pane("p2", "s1"),
      pane("p3", "s3"),
      pane("p4", "s4"),
      pane("p5", "s5"),
      pane("p6", "s6"),
    ],
  });
  assert.ok(state);
  assert.deepEqual(state.panes.map((item) => item.id), ["p1", "p3", "p4", "p5"]);
  assert.equal(state.focusedPaneId, "p1");
  assert.deepEqual(parsePaneWorkspace(serializePaneWorkspace(state)), state);
});

test("deleting an open session removes its pane and the last pane becomes a fresh fallback", () => {
  let state = createPaneWorkspace(pane("p1", "s1"));
  state = addWorkspacePane(state, pane("p2", "s2"));
  state = removeSessionFromWorkspace(state, "s1", (cwd) => pane("fresh", null, cwd));
  assert.deepEqual(state.panes.map((item) => item.sessionId), ["s2"]);
  assert.equal(state.focusedPaneId, "p2");

  state = removeSessionFromWorkspace(state, "s2", (cwd) => pane("fresh", null, cwd));
  assert.equal(state.panes.length, 1);
  assert.equal(state.panes[0].sessionId, null);
  assert.equal(state.panes[0].cwd, "/work/p2");
});

test("supports custom labels, pane swapping, maximize toggle and layout presets", () => {
  let state = createPaneWorkspace(pane("p1", "s1"));
  state = addWorkspacePane(state, pane("p2", "s2"));
  state = setPaneLabel(state, "p1", "Backend API");
  assert.equal(state.panes[0].label, "Backend API");

  state = swapWorkspacePanes(state, "p1", "p2");
  assert.equal(state.panes[0].id, "p2");
  assert.equal(state.panes[1].id, "p1");

  state = toggleMaximizePane(state, "p1");
  assert.equal(state.maximizedPaneId, "p1");
  assert.equal(state.focusedPaneId, "p1");

  state = toggleMaximizePane(state, "p1");
  assert.equal(state.maximizedPaneId, null);

  state = setLayoutPreset(state, "1+2");
  assert.equal(state.layoutPreset, "1+2");

  const serialized = serializePaneWorkspace(state);
  const parsed = parsePaneWorkspace(serialized);
  assert.equal(parsed.layoutPreset, "1+2");
  assert.equal(parsed.panes[1].label, "Backend API");
});
