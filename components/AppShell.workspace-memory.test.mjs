import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

function callbackBody(name, nextName) {
  const start = source.indexOf(`const ${name} = useCallback`);
  const end = source.indexOf(`\n  const ${nextName}`, start);
  assert.notEqual(start, -1, `${name} callback not found`);
  assert.notEqual(end, -1, `${nextName} callback not found after ${name}`);
  return source.slice(start, end);
}

test("explicit context changes invalidate a pending workspace restore", () => {
  const callbacks = [
    ["handleCwdChange", "handleSelectSession"],
    ["handleSelectSession", "handleNewSession"],
    ["handleNewSession", "hydratePaneSession"],
    ["handleSessionDeleted", "handleOpenFile"],
  ];

  for (const [name, nextName] of callbacks) {
    const body = callbackBody(name, nextName);
    assert.match(body, /invalidateWorkspaceRestore\(\);/);
  }
});

test("async pane promotion projects global context only after a current focused commit", () => {
  const created = callbackBody("handlePaneSessionCreated", "deliverSessionNotification");
  const forked = callbackBody("handlePaneSessionForked", "handleInitialRestoreDone");
  assert.match(created, /setPanes\(\(current\) =>/);
  assert.match(created, /origin\.revision !== expectedRevision/);
  assert.match(created, /origin\.session !== null/);
  assert.match(created, /expectedKey !== sourceDraftKey/);
  assert.match(forked, /setPanes\(\(current\) =>/);
  assert.match(forked, /origin\.session\?\.id !== expectedSessionId/);
  assert.match(source, /if \(focusedPaneIdRef\.current !== paneId\) continue;/);
  assert.match(source, /invalidateWorkspaceRestore\(\);[\s\S]*?router\.replace\(`/);
});

test("all active-session transitions share one persistence effect", () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{\s+if \(!selectedSession\) return;[\s\S]*?setLastOpenSession\(projectKey, selectedSession\.id\);\s+\}, \[selectedSession\]\);/,
  );
});

test("workspace restoration remains inside the cross-project branch", () => {
  assert.match(
    callbackBody("handleCwdChange", "handleSelectSession"),
    /if \(currentProject !== newProject\) \{[\s\S]*?restoreWorkspaceContext\(newProject\);[\s\S]*?\}/,
  );
});

test("session deletion derives from live panes and preserves fallback project identity", () => {
  const deleted = callbackBody("handleSessionDeleted", "handleOpenFile");
  assert.match(deleted, /setPanes\(\(current\) =>/);
  assert.match(deleted, /const liveFocusedPaneId = focusedPaneIdRef\.current/);
  assert.match(deleted, /panes: current\.map/);
  assert.match(deleted, /projectRoot: deletedPane\.session\?\.projectRoot \?\? deletedPane\.projectRoot/);
  assert.match(deleted, /pendingPaneDeletionRef\.current =/);
});
