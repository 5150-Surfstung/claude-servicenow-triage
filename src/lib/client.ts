"use client";

/** Browser-side fetch wrapper that carries the demo access code and surfaces a readable error. */

const KEY = "sn-triage.access-code";

export function getAccessCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string) {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    /* private mode: fall through, the next request will ask again */
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly detail?: unknown) {
    super(code);
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demo-code": getAccessCode() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `http_${res.status}`, data.detail);
  return data as T;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "access_code_required":
      case "access_code_invalid":
        return "This demo needs an access code.";
      case "rate_limited":
        return "Too many requests from this network. Wait a minute and try again.";
      case "empty":
        return "Type a maintenance request first.";
      case "too_long":
        return "That message is over 4,000 characters. Shorten it.";
      default:
        return `Request failed (${err.code}).`;
    }
  }
  return "The server didn't answer. Check that it's running.";
}
