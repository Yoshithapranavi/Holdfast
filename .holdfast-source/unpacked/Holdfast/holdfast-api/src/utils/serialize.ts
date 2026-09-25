import type { User } from "@prisma/client";

// The shape of a user as it's safe to hand to any client — never the
// password hash, and full email only when it's the caller's own account.
export function toPublicUser(user: User, opts: { includeEmail?: boolean } = {}) {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    bio: user.bio,
    city: user.city,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
    ...(opts.includeEmail ? { email: user.email } : {}),
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
