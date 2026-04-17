// Initializes Sentry in the browser. No-op when NEXT_PUBLIC_SENTRY_DSN is
// unset so local development and self-hosted deployments don't send traffic
// unintentionally. NEXT_PUBLIC_SENTRY_DSN is the Next convention for exposing
// a public DSN to the client bundle; it differs from the server-only
// SENTRY_DSN read in instrumentation.ts.
if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: Number.parseFloat(
          process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
        ),
      });
    })
    .catch(() => {
      /* silent degradation */
    });
}
