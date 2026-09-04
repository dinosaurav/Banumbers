import { AVATARS, sanitizeAvatar, sanitizeName } from "../shared/avatars";

const TOKEN_KEY = "banumbers.token";
const PROFILE_KEY = "banumbers.profile";

export interface Profile {
  name: string;
  avatar: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A private, per-browser token that identifies this player to the server. */
export function getToken(): string {
  const s = storage();
  let token = s?.getItem(TOKEN_KEY) ?? null;
  if (!token) {
    token = crypto.randomUUID();
    s?.setItem(TOKEN_KEY, token);
  }
  return token;
}

const DEFAULT_NAMES = ["Banana Joe", "Plantain", "Chiquita", "Cavendish", "Peelbert", "Nana", "Bunchy", "Slippy"];

export function getProfile(): Profile {
  const s = storage();
  try {
    const raw = s?.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      const name = sanitizeName(parsed.name);
      if (name) return { name, avatar: sanitizeAvatar(parsed.avatar) };
    }
  } catch {
    // fall through
  }
  const name = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)]!;
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]!;
  const profile = { name, avatar };
  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: Profile): void {
  storage()?.setItem(
    PROFILE_KEY,
    JSON.stringify({ name: sanitizeName(profile.name), avatar: sanitizeAvatar(profile.avatar) }),
  );
}
