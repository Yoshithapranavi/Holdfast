import { prisma } from "../lib/prisma";
import type { Visibility } from "@prisma/client";

// Two users are "partners" once either side has invited the other and the
// invite was accepted — mirrors the onboarding step and the profile's
// "Ask to be partners" action. This is the single source of truth other
// modules use to decide what PARTNERS-visibility content to show.
export async function arePartners(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return true;
  const partnership = await prisma.partnership.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userA, recipientId: userB },
        { requesterId: userB, recipientId: userA },
      ],
    },
    select: { id: true },
  });
  return Boolean(partnership);
}

export async function canView(
  viewerId: string | undefined,
  ownerId: string,
  visibility: Visibility
): Promise<boolean> {
  if (visibility === "PUBLIC") return true;
  if (!viewerId) return false;
  if (viewerId === ownerId) return true;
  if (visibility === "PRIVATE") return false;
  // PARTNERS
  return arePartners(viewerId, ownerId);
}

// Given a list of accepted partnerships for `userId`, return the other
// party's user id for each — used to build "your partners" lists.
export async function listPartnerIds(userId: string): Promise<string[]> {
  const rows = await prisma.partnership.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { recipientId: userId }],
    },
    select: { requesterId: true, recipientId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.recipientId : r.requesterId));
}
