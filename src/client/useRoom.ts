import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomState, ServerMessage } from "../shared/types";
import { getProfile, getToken } from "./identity";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface RoomConnection {
  status: ConnectionStatus;
  room: RoomState | null;
  playerId: string | null;
  /** Blocking error: room full, game in progress, room gone, kicked. */
  fatalError: string | null;
  /** Transient errors to toast. */
  notice: { id: number; message: string } | null;
  /** Add to Date.now() to approximate the server clock. */
  clockOffset: number;
  send: (msg: ClientMessage) => void;
  leave: () => void;
}

const PING_INTERVAL_MS = 30_000;

export function useRoom(code: string): RoomConnection {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);
  const welcomedRef = useRef(false);
  const attemptsRef = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const noticeId = useRef(0);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    welcomedRef.current = false;
    attemptsRef.current = 0;

    const connect = () => {
      if (stoppedRef.current) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/api/rooms/${code}/ws`);
      wsRef.current = ws;
      setStatus(attemptsRef.current === 0 ? "connecting" : "reconnecting");

      ws.onopen = () => {
        const profile = getProfile();
        ws.send(
          JSON.stringify({
            type: "join",
            token: getToken(),
            name: profile.name,
            avatar: profile.avatar,
          } satisfies ClientMessage),
        );
      };

      ws.onmessage = (ev) => {
        if (wsRef.current !== ws) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (msg.type) {
          case "welcome":
            attemptsRef.current = 0;
            welcomedRef.current = true;
            setPlayerId(msg.playerId);
            setRoom(msg.state);
            setClockOffset(msg.serverNow - Date.now());
            setStatus("open");
            break;
          case "state":
            setRoom(msg.state);
            setClockOffset(msg.serverNow - Date.now());
            break;
          case "pong":
            setClockOffset(msg.serverNow - Date.now());
            break;
          case "kicked":
            stoppedRef.current = true;
            setFatalError("The host removed you from the room.");
            break;
          case "error":
            if (msg.fatal) {
              stoppedRef.current = true;
              setFatalError(msg.message);
            } else {
              noticeId.current += 1;
              setNotice({ id: noticeId.current, message: msg.message });
            }
            break;
        }
      };

      ws.onclose = () => {
        // A superseded socket (StrictMode remount, or the server replacing an
        // older tab) must not trigger a reconnect, or two sockets would keep
        // replacing each other forever.
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (stoppedRef.current) {
          setStatus("closed");
          return;
        }
        attemptsRef.current += 1;
        setStatus("reconnecting");
        // Never got in? The room code may simply not exist.
        if (!welcomedRef.current && attemptsRef.current >= 2) {
          void fetch(`/api/rooms/${code}`)
            .then((r) => {
              if (r.status === 404) {
                stoppedRef.current = true;
                setFatalError(`There's no room with code ${code}. It may have expired.`);
                setStatus("closed");
              }
            })
            .catch(() => {});
        }
        const delay = Math.min(8000, 400 * 2 ** Math.min(attemptsRef.current, 5)) + Math.random() * 300;
        reconnectTimer.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose follows and handles the retry.
      };
    };

    connect();

    const ping = window.setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible" && !wsRef.current && !stoppedRef.current) {
        if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stoppedRef.current = true;
      window.clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisible);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, "navigating away");
      wsRef.current = null;
    };
  }, [code, send]);

  const leave = useCallback(() => {
    stoppedRef.current = true;
    send({ type: "leave" });
    wsRef.current?.close(1000, "left");
    wsRef.current = null;
    setStatus("closed");
  }, [send]);

  return { status, room, playerId, fatalError, notice, clockOffset, send, leave };
}
