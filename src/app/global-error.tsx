"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Keep it dependency-free. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-md px-4 py-10">
        <main id="main" role="alert">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2">Cleared couldn&apos;t load. Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
