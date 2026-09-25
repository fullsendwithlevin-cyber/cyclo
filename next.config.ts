import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // Der Dateispeicher liest Pfade zur Laufzeit (UPLOAD_DIR). Hochgeladene Dateien, Tests und
  // Quellcode gehören nicht in das Server-Bundle.
  outputFileTracingExcludes: {
    "*": ["storage/**", "tests/**", "docs/**", "index.html", ".git/**", "test-results/**", "playwright-report/**"],
  },
  turbopack: {
    ignoreIssue: [{ path: /lib\/documents\/storage\.ts$/, title: /Dynamic filesystem access/ }],
  },
  serverExternalPackages: ["playwright-core", "exceljs", "mammoth", "unpdf", "web-push", "nodemailer", "pg", "@prisma/adapter-pg"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
