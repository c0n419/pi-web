"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemePreset =
  | "auto"
  | "light"
  | "dark"
  | "catppuccin-mocha"
  | "catppuccin-macchiato"
  | "catppuccin-frappe"
  | "catppuccin-latte"
  | "tokyo-night"
  | "dracula"
  | "nord";

export type ThemePreference = ThemePreset;
export type ResolvedTheme = "light" | "dark";

export interface ThemeMeta {
  id: ThemePreset;
  name: string;
  category: "standard" | "catppuccin" | "developer";
  isDark: boolean;
  bg: string;
  accent: string;
}

export const THEME_CATALOG: ThemeMeta[] = [
  { id: "auto", name: "Auto (System)", category: "standard", isDark: false, bg: "#ffffff", accent: "#2563eb" },
  { id: "light", name: "Light (Default)", category: "standard", isDark: false, bg: "#ffffff", accent: "#2563eb" },
  { id: "dark", name: "Dark (Default)", category: "standard", isDark: true, bg: "#1a1a1a", accent: "#60a5fa" },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", category: "catppuccin", isDark: true, bg: "#1e1e2e", accent: "#89b4fa" },
  { id: "catppuccin-macchiato", name: "Catppuccin Macchiato", category: "catppuccin", isDark: true, bg: "#24273a", accent: "#8aadf4" },
  { id: "catppuccin-frappe", name: "Catppuccin Frappé", category: "catppuccin", isDark: true, bg: "#303446", accent: "#8caaee" },
  { id: "catppuccin-latte", name: "Catppuccin Latte", category: "catppuccin", isDark: false, bg: "#eff1f5", accent: "#1e66f5" },
  { id: "tokyo-night", name: "Tokyo Night", category: "developer", isDark: true, bg: "#1a1b26", accent: "#7aa2f7" },
  { id: "dracula", name: "Dracula", category: "developer", isDark: true, bg: "#282a36", accent: "#bd93f9" },
  { id: "nord", name: "Nord", category: "developer", isDark: true, bg: "#2e3440", accent: "#88c0d0" },
];

type ThemeState = {
  preference: ThemePreference;
  theme: ResolvedTheme;
};

type ToggleOrigin = { x: number; y: number };

const STORAGE_KEY = "pi-theme";
const PREFERENCE_CYCLE: ThemePreference[] = [
  "light",
  "dark",
  "catppuccin-mocha",
  "catppuccin-latte",
  "auto",
];
const SERVER_SNAPSHOT: ThemeState = { preference: "auto", theme: "light" };

const listeners = new Set<() => void>();
let state: ThemeState | null = null;
let systemListening = false;

function emit(): void {
  listeners.forEach((cb) => cb());
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (value && THEME_CATALOG.some((t) => t.id === value)) return value;
  } catch {
    // ignore storage errors
  }
  return "auto";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "auto") return getSystemTheme();
  const meta = THEME_CATALOG.find((t) => t.id === preference);
  if (meta) return meta.isDark ? "dark" : "light";
  return preference === "dark" ? "dark" : "light";
}

function applyDomTheme(preference: ThemePreference, theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (preference === "light" || preference === "dark" || preference === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", preference);
  }
}

function ensureState(): ThemeState {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (state) return state;

  const preference = readStoredPreference();
  const theme = resolveTheme(preference);
  applyDomTheme(preference, theme);
  state = { preference, theme };
  return state;
}

function setThemeState(preference: ThemePreference, theme: ResolvedTheme, persist: boolean): void {
  applyDomTheme(preference, theme);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore storage errors
    }
  }
  state = { preference, theme };
  emit();
}

function syncAutoThemeFromSystem(): void {
  const current = ensureState();
  if (current.preference !== "auto") return;
  const theme = getSystemTheme();
  if (theme === current.theme) return;
  setThemeState("auto", theme, false);
}

function ensureSystemListener(): void {
  if (systemListening || typeof window === "undefined" || !window.matchMedia) return;

  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", syncAutoThemeFromSystem);
  window.addEventListener("focus", syncAutoThemeFromSystem);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncAutoThemeFromSystem();
  });
  systemListening = true;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensureState();
  ensureSystemListener();
  syncAutoThemeFromSystem();
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ThemeState {
  return ensureState();
}

function getServerSnapshot(): ThemeState {
  return SERVER_SNAPSHOT;
}

function nextPreference(preference: ThemePreference): ThemePreference {
  const index = PREFERENCE_CYCLE.indexOf(preference);
  if (index < 0) return "auto";
  return PREFERENCE_CYCLE[(index + 1) % PREFERENCE_CYCLE.length];
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((targetPref: ThemePreference, origin?: ToggleOrigin) => {
    const nextTheme = resolveTheme(targetPref);

    const apply = () => {
      setThemeState(targetPref, nextTheme, true);
    };

    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const supportsVT = typeof document !== "undefined" && typeof document.startViewTransition === "function";

    if (!supportsVT || reduceMotion) {
      apply();
      return;
    }

    const x = origin?.x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 0);
    const y = origin?.y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 0);
    const endRadius = typeof window !== "undefined"
      ? Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      : 1000;

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 450,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // transition cancelled
      });
  }, []);

  const toggleTheme = useCallback((origin?: ToggleOrigin) => {
    const current = ensureState();
    const nextPref = nextPreference(current.preference);
    setTheme(nextPref, origin);
  }, [setTheme]);

  return {
    theme: snapshot.theme,
    preference: snapshot.preference,
    setTheme,
    toggleTheme,
    isDark: snapshot.theme === "dark",
    catalog: THEME_CATALOG,
  };
}
