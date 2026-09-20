import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv, type Connect, type Plugin } from "vite";
import { TRANSCRIPT_LIMITS, type Transcript } from "../shared/turn.ts";
import { answerWeatherTurn, liveDeps, type WeatherTurnDeps } from "./weather-turn.ts";

const BODY_LIMIT = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Unknown JSON becomes a transcript, or null when the body is outside the limits. */
export function parseTranscript(body: unknown): Transcript | null {
  if (!isRecord(body)) {
    return null;
  }
  const latest = body.latest;
  const earlier = body.earlier;
  if (typeof latest !== "string" || latest.trim() === "") {
    return null;
  }
  if (latest.length > TRANSCRIPT_LIMITS.maxCharsPerRequest) {
    return null;
  }
  if (!Array.isArray(earlier) || earlier.length > TRANSCRIPT_LIMITS.maxEarlier) {
    return null;
  }
  const texts: string[] = [];
  for (const item of earlier) {
    if (typeof item !== "string" || item.length > TRANSCRIPT_LIMITS.maxCharsPerRequest) {
      return null;
    }
    texts.push(item);
  }
  return { latest, earlier: texts };
}

export async function handleTurn(
  body: unknown,
  deps: WeatherTurnDeps,
): Promise<
  | { readonly status: 200; readonly body: Awaited<ReturnType<typeof answerWeatherTurn>> }
  | { readonly status: 400; readonly body: { readonly error: string } }
> {
  const transcript = parseTranscript(body);
  if (transcript === null) {
    return {
      status: 400,
      body: { error: "Send a latest message and at most 6 earlier messages." },
    };
  }
  return { status: 200, body: await answerWeatherTurn(transcript, deps) };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function attach(middlewares: Connect.Server, deps: WeatherTurnDeps): void {
  middlewares.use((req, res, next) => {
    void handleRequest(req, res, next, deps);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
  deps: WeatherTurnDeps,
): Promise<void> {
  const path = req.url?.split("?")[0];
  if (path !== "/api/turn") {
    next();
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  try {
    const raw = await readBody(req);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Send a latest message and at most 6 earlier messages." }));
      return;
    }
    const result = await handleTurn(json, deps);
    res.statusCode = result.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result.body));
  } catch (error) {
    next(error);
  }
}

function rememberKey(root: string, mode: string): void {
  const env = loadEnv(mode, root, "");
  const key = env.TYPESAFE_API_KEY;
  if (key && key.trim() !== "") {
    process.env.TYPESAFE_API_KEY = key;
  }
}

/** Serves POST /api/turn inside the Vite process, where the API key stays. */
export function weatherApi(): Plugin {
  return {
    name: "weather-api",
    configureServer(server) {
      rememberKey(server.config.root, server.config.mode);
      attach(server.middlewares, liveDeps());
    },
    configurePreviewServer(server) {
      rememberKey(server.config.root, server.config.mode);
      attach(server.middlewares, liveDeps());
    },
  };
}
