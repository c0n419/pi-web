import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SessionWorkspace.tsx", import.meta.url), "utf8");
const appShell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatWindow = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("workspace keeps every pane mounted and makes only the focused mobile pane accessible", () => {
  assert.match(source, /panes\.map\(\(pane, index\) =>/);
  assert.match(source, /aria-hidden=\{hiddenOnMobile \|\| undefined\}/);
  assert.match(source, /inert=\{hiddenOnMobile \|\| undefined\}/);
  assert.match(css, /\.session-pane\.is-mobile-hidden\s*\{\s*display: none;/);
});

test("desktop layouts implement 1, 2, 3 and 4 pane grids", () => {
  assert.match(css, /\.session-workspace-grid\.panes-1/);
  assert.match(css, /\.session-workspace-grid\.panes-2[^}]*repeat\(2/);
  assert.match(css, /\.session-workspace-grid\.panes-3 \.session-pane:first-child \{ grid-row: 1 \/ 3;/);
  assert.match(css, /\.session-workspace-grid\.panes-4[^}]*repeat\(2/);
});

test("global abort and shared toolbar callbacks belong only to the focused pane", () => {
  assert.match(chatWindow, /if \(!isFocused\) return;\s*registerAbortHandler/);
  assert.match(source, /onBranchDataChange=\{focused \? onFocusedBranchDataChange : undefined\}/);
  assert.match(source, /onSystemPromptChange=\{focused \? onFocusedSystemPromptChange : undefined\}/);
  assert.match(source, /onSessionStatsChange=\{focused \? onFocusedSessionStatsChange : undefined\}/);
  assert.match(source, /onContextUsageChange=\{focused \? onFocusedContextUsageChange : undefined\}/);
});

test("pane-origin callbacks are routed with pane ids and sidebar targets the focused pane", () => {
  assert.match(source, /onSessionCreated=\{\(session, sourceDraftKey\) => onPaneSessionCreated\(pane\.id, pane\.revision/);
  assert.match(source, /onSessionForked=\{\(newSessionId\) => \{\s*if \(pane\.session\) onPaneSessionForked\(pane\.id, pane\.revision, pane\.session\.id/);
  assert.match(source, /onAgentEnd=\{\(\) => onPaneAgentEnd\(pane\.id\)\}/);
  assert.match(appShell, /const existingPane = panes\.find\(\(pane\) => pane\.session\?\.id === session\.id\)/);
  assert.match(appShell, /focusPaneContext\(existingPane\.id\)/);
});

test("worktree identity refreshes when project root resolves without a cwd change", () => {
  assert.match(sidebar, /lastNotifiedCwdContextRef/);
  assert.match(sidebar, /previous\?\.cwd === selectedCwd && previous\.projectRoot === projectRoot/);
  assert.match(sidebar, /onCwdChange\?\.\(selectedCwd, projectRoot\)/);
});

test("pane working directory updates cleanly and sidebar provides split new session menu", () => {
  assert.match(appShell, /handlePaneCwdChange/);
  assert.match(source, /onPaneCwdChange/);
  assert.match(source, /onNewSessionCwdChange=\{\(newCwd\) => onPaneCwdChange\?\.\(pane\.id, newCwd\)\}/);
  assert.match(chatWindow, /panes\.workingDirectory/);
  assert.match(sidebar, /sidebar\.newSessionInProject/);
  assert.match(sidebar, /sidebar\.selectDirectoryForNewSession/);
});

test("supports focus mode maximize toggle, layout presets, broadcast mode, handoff, and drag and drop", () => {
  assert.match(source, /maximizedPaneId/);
  assert.match(source, /layoutPreset/);
  assert.match(source, /isBroadcastActive/);
  assert.match(source, /handleHandoffToPane/);
  assert.match(source, /handleTabDragStart/);
  assert.match(source, /handleDrop/);
  assert.match(source, /setEditingLabelPaneId/);
  assert.match(css, /\.session-workspace-grid\.is-maximized/);
  assert.match(css, /\.session-workspace-grid\.layout-preset-1plus2/);
  assert.match(css, /\.broadcast-bar/);
});

test("layout and broadcast controls live in the shell top bar beside branches and system", () => {
  // The workspace consumes them as props; the pane tab strip no longer owns them.
  assert.match(source, /layoutPreset: PaneLayoutPreset;/);
  assert.match(source, /isBroadcastActive: boolean;/);
  assert.match(source, /onBroadcastActiveChange: \(active: boolean\) => void;/);
  assert.doesNotMatch(source, /workspace-controls-group/);
  assert.doesNotMatch(source, /setLayoutMenuOpen/);

  assert.match(appShell, /PANE_LAYOUT_PRESET_STORAGE_KEY/);
  assert.match(appShell, /const \[paneLayoutPreset, setPaneLayoutPreset\]/);
  assert.match(appShell, /const \[broadcastActive, setBroadcastActive\]/);
  assert.match(appShell, /renderPaneWorkspaceControls/);
  assert.match(appShell, /setPaneLayoutPreset\(preset\)/);
  assert.match(appShell, /layoutPreset=\{paneLayoutPreset\}/);
  assert.match(appShell, /isBroadcastActive=\{broadcastActive\}/);
});

test("sidebar drops the file explorer, project directory picker, and repo-root guide", () => {
  assert.doesNotMatch(sidebar, /<FileExplorer/);
  assert.doesNotMatch(sidebar, /files\.explorer/);
  assert.doesNotMatch(sidebar, /explorerOpen/);
  assert.doesNotMatch(sidebar, /inactiveWorktreeSelector/);
  assert.doesNotMatch(sidebar, /sidebar\.gitRepoRootOnly/);
  assert.doesNotMatch(sidebar, /sidebar\.openRepoRoot/);
  // The project dropdown button is gone; project switching stays in the new-session menu.
  assert.doesNotMatch(sidebar, /setDropdownOpen/);
  // Worktree switching itself must survive.
  assert.match(sidebar, /showWorktreeSwitcher/);
});
