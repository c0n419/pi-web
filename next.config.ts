import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(configDir, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(configDir, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const devOrigins = [
  process.env.PI_WEB_HOSTNAME,
  ...(process.env.PI_WEB_ALLOWED_HOSTS?.split(",") ?? []),
]
  .map((value) => value?.trim())
  .filter((value): value is string => Boolean(value));

const nextConfig: NextConfig = {
  outputFileTracingRoot: configDir,
  serverExternalPackages: [
    "undici",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ],
  // Next only serves dev resources (/_next/webpack-hmr, HMR chunks) to trusted
  // origins, and its patterns do not match a leading "*." wildcard label. Reuse
  // the operator's own host allow-list (PI_WEB_HOSTNAME / PI_WEB_ALLOWED_HOSTS,
  // see lib/request-security.ts) so a reverse-proxied dev server — e.g.
  // `tailscale serve` in front of a *.ts.net name — keeps working.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "100.*.*.*", ...devOrigins],
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
