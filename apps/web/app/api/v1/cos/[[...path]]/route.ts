import { type NextRequest, NextResponse } from "next/server";

const API_ORIGIN = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8080";

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxy(request: NextRequest, path: string[]) {
  const suffix = path.length ? path.join("/") : "";
  const target = new URL(`/api/v1/cos/${suffix}`, API_ORIGIN);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!hopByHop.has(key.toLowerCase())) headers.set(key, value);
  });

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      {
        title: "Bad Gateway",
        status: 502,
        detail:
          "The web app could not reach the API. On the host PC run npm run dev:lan and keep PostgreSQL running.",
        error_code: "API_PROXY_UNREACHABLE",
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!hopByHop.has(key.toLowerCase())) responseHeaders.append(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(request, path);
}

export async function OPTIONS(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(request, path);
}
