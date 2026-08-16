import type { SessionInfo } from "@/lib/types";

export interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

export interface SessionProjectGroup {
  root: string;
  sessions: SessionInfo[];
  tree: SessionTreeNode[];
  latestModified: string;
  runningCount: number;
  unreadCount: number;
}

const PROJECT_COLOR_PALETTE = [
  "#3b82f6", // blue
  "#14b8a6", // teal
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ec4899", // pink
  "#22c55e", // green
  "#06b6d4", // cyan
  "#f97316", // orange
] as const;

export function projectRootOf(session: SessionInfo): string {
  return session.projectRoot ?? session.cwd;
}

export function projectColor(root: string): string {
  let hash = 2166136261;
  for (let index = 0; index < root.length; index++) {
    hash ^= root.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return PROJECT_COLOR_PALETTE[(hash >>> 0) % PROJECT_COLOR_PALETTE.length];
}

export function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const session of sessions) {
    byId.set(session.id, { session, children: [] });
  }

  const parentOf = new Map<string, string>();
  for (const session of sessions) {
    if (session.parentSessionId) parentOf.set(session.id, session.parentSessionId);
  }

  const resolveAncestor = (id: string): string | null => {
    let current = parentOf.get(id);
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) return null;
      visited.add(current);
      if (byId.has(current)) return current;
      current = parentOf.get(current);
    }
    return null;
  };

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) byId.get(ancestor)?.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

export function groupSessionsByProject(
  sessions: SessionInfo[],
  runningSessionIds: ReadonlySet<string>,
  unreadSessionIds: ReadonlySet<string>,
  customOrder?: readonly string[],
): SessionProjectGroup[] {
  const byRoot = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    const root = projectRootOf(session);
    if (!root) continue;
    const projectSessions = byRoot.get(root);
    if (projectSessions) projectSessions.push(session);
    else byRoot.set(root, [session]);
  }

  const groups = [...byRoot.entries()]
    .map(([root, projectSessions]) => ({
      root,
      sessions: projectSessions,
      tree: buildSessionTree(projectSessions),
      latestModified: projectSessions.reduce(
        (latest, session) => session.modified > latest ? session.modified : latest,
        "",
      ),
      runningCount: projectSessions.filter((session) => runningSessionIds.has(session.id)).length,
      unreadCount: projectSessions.filter((session) => unreadSessionIds.has(session.id)).length,
    }));

  if (customOrder && customOrder.length > 0) {
    const orderMap = new Map<string, number>();
    customOrder.forEach((root, idx) => orderMap.set(root, idx));
    return groups.sort((a, b) => {
      const idxA = orderMap.get(a.root);
      const idxB = orderMap.get(b.root);
      if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
      if (idxA !== undefined) return -1;
      if (idxB !== undefined) return 1;
      const aActive = a.runningCount > 0 ? 1 : 0;
      const bActive = b.runningCount > 0 ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aUnread = a.unreadCount > 0 ? 1 : 0;
      const bUnread = b.unreadCount > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return b.latestModified.localeCompare(a.latestModified);
    });
  }

  return groups.sort((a, b) => {
    const aActive = a.runningCount > 0 ? 1 : 0;
    const bActive = b.runningCount > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aUnread = a.unreadCount > 0 ? 1 : 0;
    const bUnread = b.unreadCount > 0 ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return b.latestModified.localeCompare(a.latestModified);
  });
}

export function parseCollapsedProjectRoots(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((root): root is string => typeof root === "string"));
  } catch {
    return new Set();
  }
}

export function serializeCollapsedProjectRoots(roots: ReadonlySet<string>): string {
  return JSON.stringify([...roots].sort());
}
