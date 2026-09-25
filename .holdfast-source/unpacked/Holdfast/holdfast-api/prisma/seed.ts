import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mirrors the sample content used throughout the Holdfast UI showcase, so
// the API and the design reference the same people, goals and challenge.
// The password for every seeded account is "holdfast123".

async function main() {
  const passwordHash = await bcrypt.hash("holdfast123", 12);

  const [nadia, tomas, june, sam, ade, lena, rina] = await Promise.all(
    [
      { name: "Nadia Farrell", handle: "nadiaf", email: "nadia@example.com", city: "Lisbon", avatarColor: "#B23A2E" },
      { name: "Tomas Oyelaran", handle: "tomruns", email: "tomas@example.com", city: "Lisbon", avatarColor: "#2F5D7C" },
      { name: "June Park", handle: "junep", email: "june@example.com", city: "Lisbon", avatarColor: "#6B4E8C" },
      { name: "Sam Whitlock", handle: "swhit", email: "sam@example.com", city: "Lisbon", avatarColor: "#3F6B57" },
      { name: "Ade Ogun", handle: "adeogun", email: "ade@example.com", city: "Lisbon", avatarColor: "#8A5A2B" },
      { name: "Lena Costa", handle: "lenac", email: "lena@example.com", city: "Porto", avatarColor: "#7A2F4F" },
      { name: "Rina Kalra", handle: "rinak", email: "rina@example.com", city: "Lisbon", avatarColor: "#42505C" },
    ].map((u) => prisma.user.create({ data: { ...u, passwordHash } }))
  );

  // Starting demo balances + default settings, same as new-account provisioning.
  for (const u of [nadia, tomas, june, sam, ade, lena, rina]) {
    await prisma.stakeAccount.create({ data: { userId: u.id, balance: 240 } });
    await prisma.ledgerEntry.create({
      data: { userId: u.id, amount: 240, reason: "SIGNUP_GRANT", memo: "Starting demo balance" },
    });
    await prisma.privacySetting.createMany({
      data: [
        { userId: u.id, field: "sessions", visibleTo: "PARTNERS" },
        { userId: u.id, field: "proof_media", visibleTo: "PARTNERS" },
        { userId: u.id, field: "missed_days", visibleTo: "PARTNERS" },
        { userId: u.id, field: "notes", visibleTo: "PARTNERS" },
        { userId: u.id, field: "measurements", visibleTo: "PRIVATE" },
        { userId: u.id, field: "location", visibleTo: "PARTNERS" },
      ],
    });
    await prisma.notificationSetting.createMany({
      data: [
        { userId: u.id, key: "proof_requested", enabled: true, channel: "push" },
        { userId: u.id, key: "session_witnessed", enabled: true, channel: "digest" },
        { userId: u.id, key: "streak_ending", enabled: true, channel: "push" },
        { userId: u.id, key: "partner_missed_day", enabled: false, channel: "push" },
        { userId: u.id, key: "new_challenges", enabled: false, channel: "email" },
      ],
    });
  }

  // Nadia's partner graph: Tomas, June, Sam, Ade accepted; Lena still pending.
  await prisma.partnership.createMany({
    data: [
      { requesterId: nadia.id, recipientId: tomas.id, status: "ACCEPTED", respondedAt: new Date() },
      { requesterId: nadia.id, recipientId: june.id, status: "ACCEPTED", respondedAt: new Date() },
      { requesterId: nadia.id, recipientId: sam.id, status: "ACCEPTED", respondedAt: new Date() },
      { requesterId: ade.id, recipientId: nadia.id, status: "ACCEPTED", respondedAt: new Date() },
      { requesterId: nadia.id, recipientId: lena.id, status: "PENDING" },
    ],
  });

  // Nadia's goals, matching the Goals screen.
  const runGoal = await prisma.goal.create({
    data: {
      userId: nadia.id,
      title: "Run 60 km before 30 September",
      metric: "DISTANCE",
      targetValue: 60,
      unit: "km",
      currentValue: 47.2,
      deadline: new Date("2026-09-30"),
      visibility: "PUBLIC",
      status: "ACTIVE",
      witnesses: {
        create: [{ userId: tomas.id }, { userId: june.id }, { userId: sam.id }],
      },
      milestones: {
        create: [
          { title: "First 15 km week", achievedAt: new Date("2026-08-31") },
          { title: "Halfway — 30 km", achievedAt: new Date("2026-09-07") },
          { title: "Longest run over 12 km" },
        ],
      },
    },
  });

  await prisma.goal.create({
    data: {
      userId: nadia.id,
      title: "Strength work 3× a week",
      metric: "FREQUENCY",
      targetValue: 3,
      unit: "sessions/week",
      currentValue: 2,
      visibility: "PARTNERS",
      status: "ACTIVE",
      witnesses: { create: [{ userId: sam.id }] },
    },
  });

  await prisma.goal.create({
    data: {
      userId: nadia.id,
      title: "Sleep before 23:30 on weeknights",
      metric: "HABIT",
      targetValue: 5,
      unit: "nights/week",
      currentValue: 4,
      visibility: "PRIVATE",
      status: "ACTIVE",
    },
  });

  // The featured challenge from the discovery screen.
  const baseMiles = await prisma.challenge.create({
    data: {
      title: "October Base Miles",
      description:
        "Four weeks of easy aerobic volume before winter racing. Start at your current weekly distance, add ten percent each week, and keep every run conversational. Hosted by Marina Run Club.",
      category: "Running",
      hostId: tomas.id,
      hostName: "Marina Run Club",
      durationWeeks: 4,
      startDate: new Date("2026-09-28"),
      proofRequirement: "GPS_SCREENSHOT",
      proofFrequencyPerWeek: 2,
      capacity: 40,
      visibility: "PUBLIC",
      allowsDemoStaking: true,
      weeks: {
        create: [
          { weekNumber: 1, focus: "Baseline — match last week's distance", targetValue: 32, targetUnit: "km" },
          { weekNumber: 2, focus: "Add 10% · long run to 11 km", targetValue: 35, targetUnit: "km" },
          { weekNumber: 3, focus: "Add 10% · one hill session", targetValue: 39, targetUnit: "km" },
          { weekNumber: 4, focus: "Cut back · finish with a 14 km long run", targetValue: 30, targetUnit: "km" },
        ],
      },
    },
  });

  await prisma.challenge.create({
    data: {
      title: "The 6 AM Club",
      description: "Train before seven, any discipline. Photo check-in with a timestamp before 07:00 local.",
      category: "Habit",
      hostId: ade.id,
      hostName: "Ade Ogun",
      durationWeeks: 3,
      startDate: new Date("2026-09-28"),
      proofRequirement: "PHOTO_OR_VIDEO",
      proofFrequencyPerWeek: 7,
      visibility: "PUBLIC",
    },
  });

  await prisma.challenge.create({
    data: {
      title: "No-Zero November",
      description:
        "Every day gets something: a session, a walk, or ten minutes of mobility. Zero days end your run.",
      category: "Any discipline",
      hostId: ade.id,
      hostName: "Ade Ogun",
      durationWeeks: 4,
      startDate: new Date("2026-10-25"),
      proofRequirement: "CHECK_IN",
      proofFrequencyPerWeek: 7,
      visibility: "PUBLIC",
      allowsDemoStaking: true,
    },
  });

  const nadiaInBaseMiles = await prisma.challengeMember.create({
    data: { challengeId: baseMiles.id, userId: nadia.id },
  });
  await prisma.challengeMember.createMany({
    data: [
      { challengeId: baseMiles.id, userId: tomas.id },
      { challengeId: baseMiles.id, userId: june.id },
      { challengeId: baseMiles.id, userId: ade.id },
      { challengeId: baseMiles.id, userId: rina.id },
    ],
  });

  // A run through of Nadia's recent sessions, mirroring the dashboard's log.
  const nadiaSessions = [
    {
      type: "RUN" as const,
      occurredAt: new Date("2026-09-22T18:40:00Z"),
      durationSeconds: 44 * 60 + 12,
      distanceMeters: 8300,
      effort: "STEADY" as const,
      notes: "Warm 10 min, 4 × 6 min at threshold, 2 min float. Right calf tight on the cool-down.",
    },
    {
      type: "RUN" as const,
      occurredAt: new Date("2026-09-20T09:10:00Z"),
      durationSeconds: 52 * 60 + 11,
      distanceMeters: 9400,
      effort: "EASY" as const,
      notes: "Legs heavy after Saturday. Kept it conversational.",
    },
    {
      type: "STRENGTH" as const,
      occurredAt: new Date("2026-09-19T17:00:00Z"),
      durationSeconds: 48 * 60,
      effort: "HARD" as const,
      notes: "Squat 4×5 at 85 kg top set. Added 2.5 kg, depth held.",
    },
    {
      type: "SWIM" as const,
      occurredAt: new Date("2026-09-17T19:00:00Z"),
      durationSeconds: 35 * 60,
      distanceMeters: 1200,
      effort: "EASY" as const,
      notes: "Drills with June. Breathing on three.",
    },
  ];

  for (const s of nadiaSessions) {
    const session = await prisma.workoutSession.create({
      data: {
        userId: nadia.id,
        goalId: s.type === "RUN" ? runGoal.id : undefined,
        challengeMemberId: s.type === "RUN" ? nadiaInBaseMiles.id : undefined,
        visibility: "PARTNERS",
        ...s,
      },
    });
    await prisma.post.create({
      data: { userId: nadia.id, type: "SESSION", sessionId: session.id, visibility: "PARTNERS" },
    });
  }

  // Sam's proof, awaiting a witness — the feed's headline example.
  const samSession = await prisma.workoutSession.create({
    data: {
      userId: sam.id,
      type: "STRENGTH",
      occurredAt: new Date(),
      durationSeconds: 40 * 60,
      effort: "HARD",
      notes: "Deadlift day. 5 × 3 at 140 kg, last set was ugly but it moved.",
      visibility: "PARTNERS",
    },
  });
  const samProof = await prisma.proof.create({
    data: {
      sessionId: samSession.id,
      kind: "PHOTO",
      capturedAt: new Date(),
      timestampVerified: true,
      witnesses: {
        create: [
          { userId: nadia.id },
          { userId: ade.id, status: "CONFIRMED", respondedAt: new Date(), note: "Bar speed on rep two says you had one more in you." },
          { userId: june.id, status: "CONFIRMED", respondedAt: new Date() },
        ],
      },
    },
  });
  await prisma.post.create({
    data: { userId: sam.id, type: "SESSION", sessionId: samSession.id, visibility: "PARTNERS" },
  });

  // Lena's honest missed-day post.
  await prisma.post.create({
    data: {
      userId: lena.id,
      type: "MISSED_DAY",
      content:
        "Second miss this week and I'd rather say it than have it show up as a gap. Night shifts until Friday. Picking the streak back up Saturday with the long run.",
      visibility: "PARTNERS",
    },
  });

  // June's milestone post.
  await prisma.post.create({
    data: {
      userId: june.id,
      type: "MILESTONE",
      content: "Reached 40 sessions this quarter — third milestone in the Marina Swim Club challenge.",
      visibility: "PARTNERS",
    },
  });

  // A live demo stake on Nadia's run goal, matching the staking screen.
  await prisma.stakeAccount.update({ where: { userId: nadia.id }, data: { balance: { decrement: 50 } } });
  const nadiaStake = await prisma.stake.create({
    data: {
      userId: nadia.id,
      goalId: runGoal.id,
      amount: 50,
      ruleSummary: "Reach 60 km before 30 September",
      status: "ACTIVE",
    },
  });
  await prisma.ledgerEntry.create({
    data: {
      userId: nadia.id,
      amount: -50,
      reason: "STAKE_HELD",
      memo: "Staked on: Reach 60 km before 30 September",
      stakeId: nadiaStake.id,
    },
  });

  console.log("Seeded:");
  console.log(`  Users: ${[nadia, tomas, june, sam, ade, lena, rina].map((u) => u.handle).join(", ")}`);
  console.log(`  Log in as any of them with password: holdfast123`);
  console.log(`  Challenge: ${baseMiles.title} (${baseMiles.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
