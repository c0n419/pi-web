"use client";

import { createRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { BlockingExtensionUiRequest, SessionInfo, SessionTreeNode } from "@/lib/types";
import type { SessionStatsInfo } from "@/lib/pi-types";
import type { PaneLayoutPreset } from "@/lib/session-pane-workspace";
import type { ChatInputHandle } from "./ChatInput";
import { ChatWindow } from "./ChatWindow";
import { useI18n } from "@/hooks/useI18n";

import { projectColor } from "@/lib/session-project-groups";

export interface WorkspaceRuntimePane {
  id: string;
  session: SessionInfo | null;
  cwd: string | null;
  projectRoot: string | null;
  draftId: string;
  revision: number;
  label?: string | null;
}

interface Props {
  panes: WorkspaceRuntimePane[];
  focusedPaneId: string;
  runningSessionIds: Set<string>;
  isMobile: boolean;
  maxPanes: number;
  modelsRefreshKey: number;
  activeCwd?: string | null;
  focusedChatInputRef: RefObject<ChatInputHandle | null>;
  /** Layout preset and broadcast mode are rendered by the shell top bar so they
   *  sit beside Branches/System; the workspace only consumes the state. */
  layoutPreset: PaneLayoutPreset;
  isBroadcastActive: boolean;
  onBroadcastActiveChange: (active: boolean) => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  playDoneSound: () => void;
  unlockAudio: () => void;
  onFocusPane: (paneId: string) => void;
  onAddPane: () => void;
  onClosePane: (paneId: string) => void;
  onSwapPanes?: (paneIdA: string, paneIdB: string) => void;
  onSelectSessionForPane?: (paneId: string, session: SessionInfo) => void;
  onSelectSessionIdForPane?: (paneId: string, sessionId: string) => void;
  onSetPaneLabel?: (paneId: string, label: string | null) => void;
  onPaneCwdChange?: (paneId: string, cwd: string) => void;
  onPaneAgentEnd: (paneId: string) => void;
  onPaneAttentionNeeded: (paneId: string, request: BlockingExtensionUiRequest) => void;
  onPaneSessionCreated: (paneId: string, expectedRevision: number, session: SessionInfo, sourceDraftKey: string) => void;
  onPaneSessionForked: (paneId: string, expectedRevision: number, expectedSessionId: string, newSessionId: string) => void;
  onFocusedBranchDataChange: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onFocusedSystemPromptChange: (prompt: string | null) => void;
  onFocusedSystemPromptLoaderChange: (loader: (() => Promise<void>) | null) => void;
  onFocusedSessionStatsChange: (stats: SessionStatsInfo | null) => void;
  onFocusedSessionStatsPanelOpen: () => void;
  onFocusedContextUsageChange: (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => void;
  onFocusedOpenFile: (filePath: string) => void;
  children?: ReactNode;
}

function paneTitle(pane: WorkspaceRuntimePane, index: number, unsaved: string): string {
  if (pane.label) return pane.label;
  return pane.session?.name?.trim()
    || pane.session?.firstMessage?.trim()
    || (pane.session ? pane.session.id.slice(0, 8) : `${unsaved} ${index + 1}`);
}

export function SessionWorkspace({
  panes, focusedPaneId, runningSessionIds, isMobile, maxPanes, modelsRefreshKey, activeCwd,
  focusedChatInputRef, layoutPreset, isBroadcastActive, onBroadcastActiveChange,
  soundEnabled, onSoundToggle, playDoneSound, unlockAudio,
  onFocusPane, onAddPane, onClosePane, onSwapPanes, onSelectSessionForPane, onSelectSessionIdForPane, onSetPaneLabel,
  onPaneCwdChange, onPaneAgentEnd, onPaneAttentionNeeded,
  onPaneSessionCreated, onPaneSessionForked, onFocusedBranchDataChange,
  onFocusedSystemPromptChange, onFocusedSystemPromptLoaderChange,
  onFocusedSessionStatsChange, onFocusedSessionStatsPanelOpen,
  onFocusedContextUsageChange, onFocusedOpenFile, children,
}: Props) {
  const { t } = useI18n();

  // Internal interactive state for Focus Mode, Presets, Broadcast & Handoff
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("pi-web:pane-maximized-id") || null;
  });
  useEffect(() => {
    try {
      if (maximizedPaneId) localStorage.setItem("pi-web:pane-maximized-id", maximizedPaneId);
      else localStorage.removeItem("pi-web:pane-maximized-id");
    } catch {}
  }, [maximizedPaneId]);

  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastTargetIds, setBroadcastTargetIds] = useState<Set<string>>(() => new Set(panes.map((p) => p.id)));

  const [editingLabelPaneId, setEditingLabelPaneId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState("");

  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);

  const inputRefsRef = useRef(new Map<string, RefObject<ChatInputHandle | null>>());
  const localInputRefs = useMemo(() => {
    const refs = inputRefsRef.current;
    for (const pane of panes) {
      if (!refs.has(pane.id)) refs.set(pane.id, createRef<ChatInputHandle>());
    }
    for (const paneId of refs.keys()) {
      if (!panes.some((pane) => pane.id === paneId)) refs.delete(paneId);
    }
    return refs;
  }, [panes]);

  // Sync broadcast targets when panes list changes
  useEffect(() => {
    setBroadcastTargetIds((prev) => {
      const next = new Set<string>();
      for (const p of panes) {
        if (prev.has(p.id) || prev.size === 0) next.add(p.id);
      }
      return next;
    });
  }, [panes]);

  // Global Keyboard Shortcuts (Ctrl+Shift+F for Maximize, Ctrl+Shift+1..4 for Focus)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.key === "F" || event.key === "f") {
          event.preventDefault();
          setMaximizedPaneId((prev) => (prev ? null : focusedPaneId));
        } else if (["1", "2", "3", "4"].includes(event.key)) {
          event.preventDefault();
          const targetIndex = parseInt(event.key, 10) - 1;
          if (targetIndex >= 0 && targetIndex < panes.length) {
            onFocusPane(panes[targetIndex].id);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedPaneId, panes, onFocusPane]);

  const focusTabAt = (index: number) => {
    const normalized = (index + panes.length) % panes.length;
    const pane = panes[normalized];
    onFocusPane(pane.id);
    requestAnimationFrame(() => {
      document.getElementById(`session-tab-${pane.id}`)?.focus();
    });
  };

  // Broadcast Handler
  const handleSendBroadcast = useCallback(() => {
    const text = broadcastText.trim();
    if (!text || broadcastTargetIds.size === 0) return;
    for (const targetId of broadcastTargetIds) {
      const isFocused = targetId === focusedPaneId;
      const ref = isFocused ? focusedChatInputRef : localInputRefs.get(targetId);
      if (ref?.current) {
        ref.current.setValue(text);
        ref.current.submitPrompt();
      }
    }
    setBroadcastText("");
  }, [broadcastText, broadcastTargetIds, focusedPaneId, focusedChatInputRef, localInputRefs]);

  // Context Handoff Handler (Copy text summary to target pane)
  const handleHandoffToPane = useCallback((sourcePane: WorkspaceRuntimePane, targetPaneId: string) => {
    const isTargetFocused = targetPaneId === focusedPaneId;
    const targetRef = isTargetFocused ? focusedChatInputRef : localInputRefs.get(targetPaneId);
    if (!targetRef?.current) return;
    const summary = sourcePane.session
      ? `[Handoff from Pane "${paneTitle(sourcePane, 0, "")}"]: Session "${sourcePane.session.name || sourcePane.session.id}" (cwd: ${sourcePane.cwd || sourcePane.session.cwd})`
      : `[Handoff from Pane "${paneTitle(sourcePane, 0, "")}"]: cwd: ${sourcePane.cwd}`;
    targetRef.current.insertText(summary);
    onFocusPane(targetPaneId);
  }, [focusedPaneId, focusedChatInputRef, localInputRefs, onFocusPane]);

  // Drag & Drop Handlers
  const handleTabDragStart = (e: React.DragEvent, paneId: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "pane-tab", paneId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, tabOrPaneId: string, isTab: boolean) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = isTab ? "move" : "copy";
    if (isTab) setDragOverTabId(tabOrPaneId);
    else setDragOverPaneId(tabOrPaneId);
  };

  const handleDragLeave = (e: React.DragEvent, isTab: boolean) => {
    const current = e.currentTarget as HTMLElement | null;
    const related = e.relatedTarget as Node | null;
    if (current && related && current.contains(related)) {
      return;
    }
    if (isTab) setDragOverTabId(null);
    else setDragOverPaneId(null);
  };

  const handleDrop = (e: React.DragEvent, targetPaneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTabId(null);
    setDragOverPaneId(null);
    try {
      const raw =
        e.dataTransfer.getData("application/json") ||
        e.dataTransfer.getData("text/plain") ||
        e.dataTransfer.getData("Text");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.type === "pane-tab" && data.paneId) {
        onSwapPanes?.(data.paneId, targetPaneId);
      } else if (data.type === "pi-session" && (data.sessionId || data.session?.id)) {
        const sessionId = data.sessionId || data.session?.id;
        if (data.session && onSelectSessionForPane) {
          onSelectSessionForPane(targetPaneId, data.session);
        } else if (sessionId && onSelectSessionIdForPane) {
          onSelectSessionIdForPane(targetPaneId, sessionId);
        }
      }
    } catch {
      // ignore invalid drop payload
    }
  };

  // Label Edit Commit
  const commitLabelEdit = (paneId: string) => {
    onSetPaneLabel?.(paneId, editingLabelText.trim() || null);
    setEditingLabelPaneId(null);
  };

  return (
    <div className="session-workspace-shell">
      {/* Maximized Banner */}
      {maximizedPaneId && (
        <div className="maximized-pane-banner">
          <span>
            <b>{t("panes.maximize")}:</b> {paneTitle(panes.find((p) => p.id === maximizedPaneId)!, 0, t("panes.unsaved"))}
          </span>
          <button
            type="button"
            className="workspace-tool-btn"
            onClick={() => setMaximizedPaneId(null)}
          >
            🗗 {t("panes.restore")}
          </button>
        </div>
      )}

      {/* Broadcast Bar */}
      {isBroadcastActive && (
        <div className="broadcast-bar">
          <div className="broadcast-targets">
            <b>📢 {t("panes.broadcastTitle")}:</b>
            {panes.map((pane, idx) => (
              <label key={pane.id} className="broadcast-target-checkbox">
                <input
                  type="checkbox"
                  checked={broadcastTargetIds.has(pane.id)}
                  onChange={(e) => {
                    const next = new Set(broadcastTargetIds);
                    if (e.target.checked) next.add(pane.id);
                    else next.delete(pane.id);
                    setBroadcastTargetIds(next);
                  }}
                />
                <span>P{idx + 1}</span>
              </label>
            ))}
          </div>
          <input
            type="text"
            className="broadcast-input"
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSendBroadcast(); }}
            placeholder={t("panes.broadcastPlaceholder")}
          />
          <button
            type="button"
            className="broadcast-send-btn"
            onClick={handleSendBroadcast}
            disabled={!broadcastText.trim() || broadcastTargetIds.size === 0}
          >
            {t("panes.broadcastSend", { count: broadcastTargetIds.size })}
          </button>
          <button
            type="button"
            className="workspace-tool-btn"
            onClick={() => onBroadcastActiveChange(false)}
            title={t("sidebar.cancel")}
            aria-label={t("sidebar.cancel")}
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Sessions Tab Strip & Toolbar Controls */}
      <div
        className="active-session-strip"
        role="tablist"
        aria-label={t("panes.activeSessions")}
        onKeyDown={(event) => {
          const current = panes.findIndex((pane) => pane.id === focusedPaneId);
          if (current < 0) return;
          if (event.key === "ArrowLeft") focusTabAt(current - 1);
          else if (event.key === "ArrowRight") focusTabAt(current + 1);
          else if (event.key === "Home") focusTabAt(0);
          else if (event.key === "End") focusTabAt(panes.length - 1);
          else return;
          event.preventDefault();
        }}
      >
        {panes.map((pane, index) => {
          const focused = pane.id === focusedPaneId;
          const running = Boolean(pane.session && runningSessionIds.has(pane.session.id));
          const title = paneTitle(pane, index, t("panes.unsaved"));
          const effectiveCwd = pane.cwd ?? pane.session?.cwd ?? activeCwd ?? null;
          const projectKey = pane.projectRoot ?? effectiveCwd ?? pane.session?.projectRoot ?? "";
          const color = projectKey ? projectColor(projectKey) : null;
          const isMaximized = maximizedPaneId === pane.id;
          const isDragOver = dragOverTabId === pane.id;

          return (
            <div
              key={pane.id}
              draggable={editingLabelPaneId !== pane.id}
              onDragStart={(e) => handleTabDragStart(e, pane.id)}
              onDragOver={(e) => handleDragOver(e, pane.id, true)}
              onDragLeave={(e) => handleDragLeave(e, true)}
              onDrop={(e) => handleDrop(e, pane.id)}
              className={`active-session-tab${focused ? " is-focused" : ""}${running ? " is-running" : ""}${isDragOver ? " is-drag-over" : ""}`}
            >
              {editingLabelPaneId === pane.id ? (
                <input
                  type="text"
                  autoFocus
                  style={{ width: 90, height: 24, fontSize: 11, padding: "0 4px", margin: "auto 4px" }}
                  value={editingLabelText}
                  onChange={(e) => setEditingLabelText(e.target.value)}
                  onBlur={() => commitLabelEdit(pane.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitLabelEdit(pane.id);
                    if (e.key === "Escape") setEditingLabelPaneId(null);
                  }}
                />
              ) : (
                <button
                  id={`session-tab-${pane.id}`}
                  type="button"
                  role="tab"
                  aria-selected={focused}
                  aria-controls={`session-pane-${pane.id}`}
                  tabIndex={focused ? 0 : -1}
                  onClick={() => onFocusPane(pane.id)}
                  onDoubleClick={() => {
                    setEditingLabelPaneId(pane.id);
                    setEditingLabelText(pane.label || title);
                  }}
                  title={`${t("panes.switchTo", { name: title })} (${t("panes.dragHint")})`}
                >
                  <span className="active-session-state" aria-hidden="true">{running ? "▶" : ""}</span>
                  {color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", marginRight: 5, flexShrink: 0 }} aria-hidden="true" />}
                  <span>{title}</span>
                </button>
              )}

              {/* Handoff Dropdown Menu */}
              {panes.length > 1 && (
                <button
                  type="button"
                  className="active-session-action-btn"
                  onClick={() => {
                    const target = panes.find((p) => p.id !== pane.id);
                    if (target) handleHandoffToPane(pane, target.id);
                  }}
                  title={t("panes.handoff")}
                >
                  ↗
                </button>
              )}

              {/* Maximize / Restore Toggle */}
              <button
                type="button"
                className="active-session-action-btn"
                onClick={() => setMaximizedPaneId(isMaximized ? null : pane.id)}
                title={isMaximized ? t("panes.restore") : t("panes.maximize")}
              >
                {isMaximized ? "🗗" : "⛶"}
              </button>

              {/* Close Button */}
              <button
                type="button"
                className="active-session-close"
                onClick={() => {
                  if (maximizedPaneId === pane.id) setMaximizedPaneId(null);
                  onClosePane(pane.id);
                }}
                title={t("panes.closePane", { number: index + 1 })}
                aria-label={t("panes.closePane", { number: index + 1 })}
              >×</button>
            </div>
          );
        })}

        {/* Add Pane Button */}
        <button
          type="button"
          className="active-session-add"
          onClick={() => onAddPane()}
          disabled={panes.length >= maxPanes}
          title={panes.length >= maxPanes ? t("panes.maximum") : t("panes.addPane")}
          aria-label={panes.length >= maxPanes ? t("panes.maximum") : t("panes.addPane")}
        >+</button>
      </div>

      {/* Grid Workspace Panes */}
      <div
        className={`session-workspace-grid panes-${panes.length}${maximizedPaneId ? " is-maximized" : ""}${layoutPreset !== "auto" ? ` layout-preset-${layoutPreset}` : ""}`}
      >
        {panes.map((pane, index) => {
          const focused = pane.id === focusedPaneId;
          const isMaximized = maximizedPaneId === pane.id;
          const hiddenOnMobile = isMobile && !focused;
          const isDragOver = dragOverPaneId === pane.id;
          const effectiveCwd = pane.cwd ?? pane.session?.cwd ?? activeCwd ?? null;
          const draftKey = pane.session || !effectiveCwd ? null : `new:${pane.draftId}:${effectiveCwd}`;
          const inputRef = focused ? focusedChatInputRef : localInputRefs.get(pane.id)!;

          return (
            <section
              key={pane.id}
              id={`session-pane-${pane.id}`}
              role="tabpanel"
              aria-label={t("panes.paneLabel", { number: index + 1 })}
              aria-hidden={hiddenOnMobile || undefined}
              inert={hiddenOnMobile || undefined}
              className={`session-pane${focused ? " is-focused" : ""}${isMaximized ? " is-maximized" : ""}${hiddenOnMobile ? " is-mobile-hidden" : ""}${isDragOver ? " is-drag-over" : ""}`}
              onPointerDownCapture={() => { if (!focused) onFocusPane(pane.id); }}
              onDragOver={(e) => handleDragOver(e, pane.id, false)}
              onDragLeave={(e) => handleDragLeave(e, false)}
              onDrop={(e) => handleDrop(e, pane.id)}
            >
              {isDragOver && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 99,
                    background: "color-mix(in srgb, var(--accent) 25%, rgba(0,0,0,0.5))",
                    backdropFilter: "blur(2px)",
                    border: "2px dashed var(--accent)",
                    borderRadius: 6,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
                  <div>{t("panes.dropSessionHint")}</div>
                </div>
              )}
              {(pane.session || effectiveCwd) ? (
                <div
                  // Session identity intentionally owns this key: changing
                  // conversations remounts the content (as ChatWindow already
                  // required) and replays one short, GPU-friendly entrance.
                  key={`${pane.id}:${pane.session?.id ?? draftKey ?? "new"}:${pane.revision}`}
                  className="session-pane-content"
                >
                  <ChatWindow
                    session={pane.session}
                    sessionRunning={Boolean(pane.session && runningSessionIds.has(pane.session.id))}
                    isFocused={focused}
                    newSessionCwd={pane.session ? null : effectiveCwd}
                    newSessionDraftKey={draftKey}
                    onNewSessionCwdChange={(newCwd) => onPaneCwdChange?.(pane.id, newCwd)}
                    onAgentEnd={() => onPaneAgentEnd(pane.id)}
                    onAttentionNeeded={(request) => onPaneAttentionNeeded(pane.id, request)}
                    onSessionCreated={(session, sourceDraftKey) => onPaneSessionCreated(pane.id, pane.revision, session, sourceDraftKey)}
                    onSessionForked={(newSessionId) => {
                      if (pane.session) onPaneSessionForked(pane.id, pane.revision, pane.session.id, newSessionId);
                    }}
                    modelsRefreshKey={modelsRefreshKey}
                    chatInputRef={inputRef}
                    onBranchDataChange={focused ? onFocusedBranchDataChange : undefined}
                    onSystemPromptChange={focused ? onFocusedSystemPromptChange : undefined}
                    onSystemPromptLoaderChange={focused ? onFocusedSystemPromptLoaderChange : undefined}
                    onSessionStatsChange={focused ? onFocusedSessionStatsChange : undefined}
                    onSessionStatsPanelOpen={focused ? onFocusedSessionStatsPanelOpen : undefined}
                    onContextUsageChange={focused ? onFocusedContextUsageChange : undefined}
                    onOpenFile={focused ? onFocusedOpenFile : undefined}
                    soundEnabled={soundEnabled}
                    onSoundToggle={onSoundToggle}
                    playDoneSound={playDoneSound}
                    unlockAudio={unlockAudio}
                  />
                </div>
              ) : focused ? children : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
