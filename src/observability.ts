/**
 * Lightweight observability shim. Captures uncaught errors and
 * unhandled promise rejections, optionally forwarding them to a
 * monitoring service via a fetch-based webhook.
 *
 * This avoids bringing in the Sentry SDK (~80 KB gzipped) for a small
 * single-page app. If a fuller observability stack is needed later,
 * swap the implementation here without touching the rest of the code.
 *
 * Configuration via Vite env vars:
 *   VITE_ERROR_WEBHOOK_URL   — POST endpoint that accepts JSON
 *                              { message, stack, kind, url, userAgent }
 *   VITE_APP_VERSION         — included with each report
 *
 * If neither is set, errors are still logged to console.error but not
 * sent anywhere.
 */

interface ErrorReport {
  message: string;
  stack?: string;
  kind: 'error' | 'unhandledrejection';
  url?: string;
  userAgent?: string;
  appVersion?: string;
  timestamp: number;
}

function envValue(key: string): string | undefined {
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
          .env
      : undefined;
  const v = env?.[key];
  return v && v.trim() ? v.trim() : undefined;
}

const WEBHOOK = envValue('VITE_ERROR_WEBHOOK_URL');
const APP_VERSION = envValue('VITE_APP_VERSION');

let lastReportSig: string | null = null;
let lastReportAt = 0;

async function report(r: ErrorReport): Promise<void> {
  // Always log so we can debug in production via the browser console.
  // eslint-disable-next-line no-console
  console.error(`[observability] ${r.kind}: ${r.message}`, r.stack ?? '');

  if (!WEBHOOK) return;

  // De-duplicate identical errors fired in close succession (typical
  // pattern when a render loop throws every frame).
  const sig = `${r.kind}:${r.message}`;
  const now = Date.now();
  if (sig === lastReportSig && now - lastReportAt < 5000) return;
  lastReportSig = sig;
  lastReportAt = now;

  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
      keepalive: true,
    });
  } catch {
    // Network error reporting an error: nothing more we can do.
  }
}

/**
 * Attach the global error / unhandled-rejection listeners. Idempotent.
 */
export function installObservability(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', e => {
    report({
      kind: 'error',
      message: e.message ?? String(e.error ?? 'unknown error'),
      stack: e.error instanceof Error ? e.error.stack : undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
      appVersion: APP_VERSION,
      timestamp: Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', e => {
    const reason = e.reason;
    report({
      kind: 'unhandledrejection',
      message:
        reason instanceof Error
          ? reason.message
          : String(reason ?? 'unhandled rejection'),
      stack: reason instanceof Error ? reason.stack : undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
      appVersion: APP_VERSION,
      timestamp: Date.now(),
    });
  });
}

/** Manually report a non-fatal issue (e.g. from a try/catch). */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err =
    error instanceof Error ? error : new Error(String(error ?? 'unknown'));
  report({
    kind: 'error',
    message: err.message,
    stack: err.stack,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    appVersion: APP_VERSION,
    timestamp: Date.now(),
    ...context,
  } as ErrorReport);
}
