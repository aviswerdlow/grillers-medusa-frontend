"use client"

import Link from "next/link"

import { useEffect, useState } from "react"
import {
  isTransientNavigationError,
  shouldRetryTransientNavigationError,
} from "@lib/util/transient-navigation-error"
import { reportClientError } from "@lib/client-error-reporter"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const recoverable = isTransientNavigationError(error)
  const [recoveryExhausted, setRecoveryExhausted] = useState(false)

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global application error:", error)

    if (!recoverable) {
      // Non-transient root-layout failure: page on-call. (The reporter drops
      // transient/self-healing nav errors, so self-recoveries never page.)
      reportClientError({
        kind: "client_unhandled_error",
        severity: "page",
        error,
      })
      return
    }

    if (!shouldRetryTransientNavigationError("global-error-reset", error)) {
      setRecoveryExhausted(true)
      return
    }

    const timer = window.setTimeout(() => reset(), 150)
    return () => window.clearTimeout(timer)
  }, [error, recoverable, reset])

  return (
    <html>
      <body>
        {recoverable && !recoveryExhausted ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              padding: "16px",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <p
              style={{
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: "6px",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
                color: "#4b5563",
                fontSize: "14px",
                margin: 0,
                padding: "12px 16px",
              }}
            >
              Reconnecting...
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              padding: "16px",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: "400px" }}>
              <h1
                style={{
                  fontSize: "32px",
                  fontWeight: "bold",
                  color: "#333",
                  marginBottom: "16px",
                }}
              >
                Something went wrong
              </h1>
              <p style={{ fontSize: "16px", color: "#666", marginBottom: "8px" }}>
                We apologize for the inconvenience. An unexpected error has
                occurred.
              </p>
              <p style={{ fontSize: "14px", color: "#999" }}>
                Please try again or return to the homepage.
              </p>
            </div>

            <div
              style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}
            >
              <button
                onClick={() => reset()}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#333",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontSize: "14px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Try again
              </button>

              <Link
                href="/"
                style={{
                  padding: "12px 24px",
                  color: "#0070f3",
                  textDecoration: "none",
                  fontSize: "14px",
                }}
              >
                Go to homepage
              </Link>
            </div>

            {error?.digest && (
              <p style={{ fontSize: "12px", color: "#999", marginTop: "16px" }}>
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}
      </body>
    </html>
  )
}
