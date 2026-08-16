"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error caught by error boundary:", error);
    // If a chunk failed to load due to a new build deployment, auto-reload
    if (
      error.name === "ChunkLoadError" ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Failed to fetch dynamically imported module")
    ) {
      window.location.reload();
    }
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg, #0d0f12)",
        color: "var(--text, #eceff4)",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
        Sayfa yüklenemedi / Page couldn't load
      </h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted, #8892b0)", marginBottom: "16px", maxWidth: "500px", textAlign: "center" }}>
        {error.message || "Bir yükleme hatası oluştu."}
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 16px",
            background: "var(--accent, #3b82f6)",
            color: "#ffffff",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          Yeniden Yükle / Reload
        </button>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            background: "var(--bg-hover, #1e222a)",
            color: "var(--text, #eceff4)",
            border: "1px solid var(--border, #2e3440)",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "13px",
          }}
        >
          Tekrar Dene / Try again
        </button>
      </div>
    </div>
  );
}
