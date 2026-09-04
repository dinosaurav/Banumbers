export const AVATARS = [
  "🐵", "🦍", "🦧", "🐒", "🦊", "🐸", "🐨", "🐼",
  "🦁", "🐯", "🐷", "🐙", "🦄", "🐲", "🦜", "🦖",
] as const;

export const MAX_NAME_LENGTH = 16;

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function sanitizeAvatar(raw: unknown): string {
  return typeof raw === "string" && (AVATARS as readonly string[]).includes(raw) ? raw : AVATARS[0];
}
