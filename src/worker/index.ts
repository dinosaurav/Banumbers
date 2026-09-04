import { GameRoom } from "./room";

export { GameRoom };

/** Unambiguous uppercase letters for room codes (no I/O). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;
const CODE_RE = /^[A-Z]{4}$/;

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST /api/rooms -> create a room, returns { code }
    if (path === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = randomCode();
        const stub = env.GAME_ROOM.getByName(code);
        if (await stub.create(code)) {
          return json({ code }, 201);
        }
      }
      return json({ error: "Could not allocate a room code, try again." }, 503);
    }

    const roomMatch = path.match(/^\/api\/rooms\/([A-Za-z]{4})(\/ws)?$/);
    if (roomMatch) {
      const code = roomMatch[1]!.toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: "Bad room code." }, 400);
      const stub = env.GAME_ROOM.getByName(code);

      if (roomMatch[2] === "/ws") {
        if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }
        return stub.fetch(request);
      }

      if (request.method === "GET") {
        const info = await stub.getInfo();
        return json(info, info.exists ? 200 : 404);
      }
      return json({ error: "Method not allowed." }, 405);
    }

    if (path.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    // Everything else is a static asset (SPA fallback handles client routes).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
