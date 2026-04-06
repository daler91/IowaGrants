import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "prisma/generated/**",
      "next-env.d.ts",
    ],
  },
  // Prevent raw console usage in server code — use lib/errors.ts log/logError/logWarn instead.
  // Client components ("use client") are excluded since they cannot import the server-side logger.
  {
    files: ["src/lib/**/*.ts", "src/app/api/**/*.ts", "src/instrumentation.ts", "src/middleware.ts"],
    rules: {
      "no-console": "warn",
    },
  },
  // The structured logger itself needs console access
  {
    files: ["src/lib/errors.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default config;
