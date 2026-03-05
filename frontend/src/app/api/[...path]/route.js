const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:5000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

export const dynamic = "force-dynamic";

const resolvePathSegments = async (context) => {
  const params = await context.params;
  const pathParam = params?.path;

  if (Array.isArray(pathParam)) {
    return pathParam;
  }

  if (typeof pathParam === "string") {
    return [pathParam];
  }

  return [];
};

const buildTargetUrl = (segments, requestUrl) => {
  const path = segments.join("/");
  const sourceUrl = new URL(requestUrl);
  return `${BACKEND_BASE_URL.replace(/\/$/, "")}/${path}${sourceUrl.search}`;
};

const copyResponseHeaders = (headers) => {
  const result = new Headers();
  for (const [key, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      result.set(key, value);
    }
  }
  return result;
};

const getForwardBody = async (request) => {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return request.formData();
  }

  return request.arrayBuffer();
};

const proxyRequest = async (request, context) => {
  if (!BACKEND_API_KEY) {
    return Response.json(
      { error: "Missing BACKEND_API_KEY in frontend environment" },
      { status: 500 }
    );
  }

  const segments = await resolvePathSegments(context);
  const targetUrl = buildTargetUrl(segments, request.url);
  const forwardHeaders = new Headers();
  forwardHeaders.set("x-api-key", BACKEND_API_KEY);
  const accept = request.headers.get("accept");
  if (accept) {
    forwardHeaders.set("accept", accept);
  }

  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.includes("multipart/form-data")) {
    forwardHeaders.set("content-type", contentType);
  }

  const body = await getForwardBody(request);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      cache: "no-store",
    });

    const upstreamBody = await upstreamResponse.arrayBuffer();
    const headers = copyResponseHeaders(upstreamResponse.headers);

    return new Response(upstreamBody, {
      status: upstreamResponse.status,
      headers,
    });
  } catch {
    return Response.json({ error: "Failed to reach backend service" }, { status: 502 });
  }
};

export async function GET(request, context) {
  return proxyRequest(request, context);
}

export async function POST(request, context) {
  return proxyRequest(request, context);
}

export async function PUT(request, context) {
  return proxyRequest(request, context);
}

export async function PATCH(request, context) {
  return proxyRequest(request, context);
}

export async function DELETE(request, context) {
  return proxyRequest(request, context);
}
