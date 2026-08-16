export const PANE_WORKSPACE_VERSION = 1 as const;
export const PANE_WORKSPACE_STORAGE_KEY = "pi-web:pane-workspace:v1";
export const MAX_SESSION_PANES = 4;

export interface PaneDescriptor {
  id: string;
  sessionId: string | null;
  cwd: string | null;
  projectRoot: string | null;
  draftId: string;
  label?: string | null;
}

export type PaneLayoutPreset = "auto" | "1x1" | "1+2" | "2x1" | "2x2";

export interface PaneWorkspaceState {
  version: typeof PANE_WORKSPACE_VERSION;
  panes: PaneDescriptor[];
  focusedPaneId: string;
  maximizedPaneId?: string | null;
  layoutPreset?: PaneLayoutPreset;
  broadcastActive?: boolean;
  broadcastTargetIds?: string[];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function createPaneDescriptor(
  id: string,
  options: { sessionId?: string | null; cwd?: string | null; projectRoot?: string | null; draftId?: string; label?: string | null } = {},
): PaneDescriptor {
  return {
    id,
    sessionId: options.sessionId ?? null,
    cwd: options.cwd ?? null,
    projectRoot: options.projectRoot ?? null,
    draftId: options.draftId ?? id,
    label: options.label ?? null,
  };
}

export function createPaneWorkspace(pane: PaneDescriptor): PaneWorkspaceState {
  return { version: PANE_WORKSPACE_VERSION, panes: [pane], focusedPaneId: pane.id };
}

export function normalizePaneWorkspace(value: unknown): PaneWorkspaceState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { version?: unknown; panes?: unknown; focusedPaneId?: unknown };
  if (candidate.version !== PANE_WORKSPACE_VERSION || !Array.isArray(candidate.panes)) return null;

  const paneIds = new Set<string>();
  const sessionIds = new Set<string>();
  const panes: PaneDescriptor[] = [];
  for (const raw of candidate.panes) {
    if (panes.length >= MAX_SESSION_PANES) break;
    if (!raw || typeof raw !== "object") continue;
    const pane = raw as { id?: unknown; sessionId?: unknown; cwd?: unknown; projectRoot?: unknown; draftId?: unknown; label?: unknown };
    const id = nonEmptyString(pane.id);
    if (!id || paneIds.has(id)) continue;
    const sessionId = pane.sessionId == null ? null : nonEmptyString(pane.sessionId);
    if (pane.sessionId != null && !sessionId) continue;
    if (sessionId && sessionIds.has(sessionId)) continue;
    const cwd = pane.cwd == null ? null : nonEmptyString(pane.cwd);
    if (pane.cwd != null && !cwd) continue;
    const projectRoot = pane.projectRoot == null ? null : nonEmptyString(pane.projectRoot);
    if (pane.projectRoot != null && !projectRoot) continue;
    const draftId = nonEmptyString(pane.draftId) ?? id;
    const label = pane.label == null ? null : nonEmptyString(pane.label);
    paneIds.add(id);
    if (sessionId) sessionIds.add(sessionId);
    panes.push({ id, sessionId, cwd, projectRoot, draftId, label });
  }
  if (panes.length === 0) return null;
  const requestedFocus = nonEmptyString(candidate.focusedPaneId);
  const focusedPaneId = requestedFocus && paneIds.has(requestedFocus) ? requestedFocus : panes[0].id;
  
  const rawMaximized = (candidate as { maximizedPaneId?: unknown }).maximizedPaneId;
  const maximizedPaneId = typeof rawMaximized === "string" && paneIds.has(rawMaximized) ? rawMaximized : null;

  const rawPreset = (candidate as { layoutPreset?: unknown }).layoutPreset;
  const validPresets: PaneLayoutPreset[] = ["auto", "1x1", "1+2", "2x1", "2x2"];
  const layoutPreset: PaneLayoutPreset = typeof rawPreset === "string" && validPresets.includes(rawPreset as PaneLayoutPreset)
    ? (rawPreset as PaneLayoutPreset)
    : "auto";

  const rawBroadcast = (candidate as { broadcastActive?: unknown }).broadcastActive;
  const broadcastActive = Boolean(rawBroadcast);

  const rawTargets = (candidate as { broadcastTargetIds?: unknown }).broadcastTargetIds;
  const broadcastTargetIds = Array.isArray(rawTargets)
    ? rawTargets.filter((tid): tid is string => typeof tid === "string" && paneIds.has(tid))
    : undefined;

  return {
    version: PANE_WORKSPACE_VERSION,
    panes,
    focusedPaneId,
    maximizedPaneId,
    layoutPreset,
    broadcastActive,
    broadcastTargetIds,
  };
}

export function parsePaneWorkspace(raw: string | null): PaneWorkspaceState | null {
  if (!raw) return null;
  try {
    return normalizePaneWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializePaneWorkspace(state: PaneWorkspaceState): string {
  const normalized = normalizePaneWorkspace(state);
  if (!normalized) throw new Error("Cannot serialize an invalid pane workspace");
  return JSON.stringify(normalized);
}

export function focusWorkspacePane(state: PaneWorkspaceState, paneId: string): PaneWorkspaceState {
  if (state.focusedPaneId === paneId || !state.panes.some((pane) => pane.id === paneId)) return state;
  return { ...state, focusedPaneId: paneId };
}

export function replaceFocusedPane(
  state: PaneWorkspaceState,
  target: { sessionId: string | null; cwd: string | null; projectRoot: string | null; draftId: string },
): PaneWorkspaceState {
  if (target.sessionId) {
    const existing = state.panes.find((pane) => pane.sessionId === target.sessionId);
    if (existing) return focusWorkspacePane(state, existing.id);
  }
  return {
    ...state,
    panes: state.panes.map((pane) => pane.id === state.focusedPaneId
      ? { ...pane, ...target }
      : pane),
  };
}

export function addWorkspacePane(state: PaneWorkspaceState, pane: PaneDescriptor): PaneWorkspaceState {
  if (state.panes.length >= MAX_SESSION_PANES) return state;
  if (state.panes.some((current) => current.id === pane.id)) return state;
  if (pane.sessionId) {
    const existing = state.panes.find((current) => current.sessionId === pane.sessionId);
    if (existing) return focusWorkspacePane(state, existing.id);
  }
  return { ...state, panes: [...state.panes, pane], focusedPaneId: pane.id };
}

export function closeWorkspacePane(
  state: PaneWorkspaceState,
  paneId: string,
  fallback: PaneDescriptor,
): PaneWorkspaceState {
  const index = state.panes.findIndex((pane) => pane.id === paneId);
  if (index < 0) return state;
  if (state.panes.length === 1) return createPaneWorkspace(fallback);
  const panes = state.panes.filter((pane) => pane.id !== paneId);
  if (state.focusedPaneId !== paneId) return { ...state, panes };
  const nextFocus = panes[Math.min(index, panes.length - 1)].id;
  return { ...state, panes, focusedPaneId: nextFocus };
}

export function removeSessionFromWorkspace(
  state: PaneWorkspaceState,
  sessionId: string,
  createFallback: (cwd: string | null) => PaneDescriptor,
): PaneWorkspaceState {
  const matching = state.panes.find((pane) => pane.sessionId === sessionId);
  if (!matching) return state;
  return closeWorkspacePane(state, matching.id, createFallback(matching.cwd));
}

export function setPaneLabel(
  state: PaneWorkspaceState,
  paneId: string,
  label: string | null,
): PaneWorkspaceState {
  return {
    ...state,
    panes: state.panes.map((pane) => (pane.id === paneId ? { ...pane, label: label ? label.trim() : null } : pane)),
  };
}

export function swapWorkspacePanes(
  state: PaneWorkspaceState,
  paneIdA: string,
  paneIdB: string,
): PaneWorkspaceState {
  if (paneIdA === paneIdB) return state;
  const indexA = state.panes.findIndex((p) => p.id === paneIdA);
  const indexB = state.panes.findIndex((p) => p.id === paneIdB);
  if (indexA < 0 || indexB < 0) return state;
  const panes = [...state.panes];
  const temp = panes[indexA];
  panes[indexA] = panes[indexB];
  panes[indexB] = temp;
  return { ...state, panes };
}

export function toggleMaximizePane(
  state: PaneWorkspaceState,
  paneId: string,
): PaneWorkspaceState {
  if (state.maximizedPaneId === paneId) {
    return { ...state, maximizedPaneId: null };
  }
  if (!state.panes.some((p) => p.id === paneId)) return state;
  return { ...state, maximizedPaneId: paneId, focusedPaneId: paneId };
}

export function setLayoutPreset(
  state: PaneWorkspaceState,
  preset: PaneLayoutPreset,
): PaneWorkspaceState {
  return { ...state, layoutPreset: preset };
}
