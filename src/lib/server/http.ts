import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...(headers ?? {}) } });

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler with uniform error handling. */
export function route<C = { params: Record<string, string> }>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.extra ?? {}) }, e.status);
      if (e instanceof ZodError) {
        return json({ error: "Invalid request", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
      }
      if (e instanceof Error && e.message === "SUPABASE_NOT_CONFIGURED") {
        return json({ error: "Backend not configured. Add Supabase keys to .env.local (see README)." }, 503);
      }
      console.error("[api]", e);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
  return schema.parse(raw);
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Throw on Supabase error, return data. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what = "query"): T {
  if (res.error) {
    console.error(`[db] ${what}:`, res.error);
    throw new HttpError(500, `Database error during ${what}`);
  }
  return res.data as T;
}

export const isUniqueViolation = (err: { code?: string } | null | undefined) => err?.code === "23505";
