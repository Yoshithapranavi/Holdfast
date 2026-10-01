const API_BASE_URL = "";

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorData = data as ApiErrorResponse | null;
    throw new Error(
      errorData?.error?.message || `Request failed with status ${response.status}`
    );
  }

  return data as T;
}

export function getToken(): string | null {
  return null;
}

export type User = {
  id: string;
  name: string;
  email?: string;
  handle: string;
  bio?: string | null;
  city?: string | null;
  avatarColor?: string | null;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  handle: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type GoalMetric = "DISTANCE" | "DURATION" | "FREQUENCY" | "HABIT" | "CUSTOM";
export type GoalStatus = "ACTIVE" | "FINISHED" | "ARCHIVED";
export type GoalVisibility = "PUBLIC" | "PARTNERS" | "PRIVATE";

export type GoalMilestone = {
  id: string;
  title: string;
  targetValue?: number | null;
  achievedAt?: string | null;
};

export type Goal = {
  id: string;
  title: string;
  metric: GoalMetric;
  currentValue: number;
  targetValue: number;
  unit: string;
  deadline?: string | null;
  visibility: GoalVisibility;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  milestones?: GoalMilestone[];
};

export type CreateGoalInput = {
  title: string;
  metric: GoalMetric;
  targetValue: number;
  unit: string;
  deadline?: string;
  visibility?: GoalVisibility;
};

export async function getMyGoals(_token?: string, status?: GoalStatus): Promise<Goal[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<Goal[]>(`/goals/mine${query}`);
}

export async function createGoal(_token: string | undefined, input: CreateGoalInput): Promise<Goal> {
  return request<Goal>("/goals", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      targetSessions: input.targetValue,
    }),
  });
}

export async function cancelGoal(goalId: string): Promise<{ id: string; active: boolean }> {
  return request<{ id: string; active: boolean }>(
    `/goals/${encodeURIComponent(goalId)}/cancel`,
    { method: "POST" },
  );
}

export type SessionType = "RUN" | "STRENGTH" | "SWIM" | "CYCLE" | "MOBILITY" | "OTHER";
export type SessionEffort = "EASY" | "STEADY" | "HARD";

export type WorkoutSession = {
  id: string;
  userId: string;
  type: SessionType;
  occurredAt: string;
  durationSeconds: number;
  distanceMeters?: number | null;
  effort?: SessionEffort | null;
  notes?: string | null;
  visibility: GoalVisibility;
  goalId?: string | null;
  challengeMemberId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSessionInput = {
  type: SessionType;
  occurredAt: string;
  durationSeconds: number;
  distanceMeters?: number;
  effort?: SessionEffort;
  notes?: string;
  visibility?: GoalVisibility;
  goalId?: string;
  challengeMemberId?: string;
  shareToFeed?: boolean;
};

export async function getMySessions(_token?: string, limit = 20): Promise<WorkoutSession[]> {
  const rows = await request<Array<{
    id: string;
    userId: string;
    type: SessionType;
    occurredAt: string | Date;
    durationMinutes: number;
    distanceKm?: number | null;
    effort?: SessionEffort | null;
    notes?: string | null;
    goalId?: string | null;
    createdAt: string | Date;
  }>>(`/workouts?limit=${limit}`);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    type: row.type,
    occurredAt: new Date(row.occurredAt).toISOString(),
    durationSeconds: row.durationMinutes * 60,
    distanceMeters: row.distanceKm == null ? null : row.distanceKm * 1000,
    effort: row.effort ?? null,
    notes: row.notes ?? null,
    visibility: "PRIVATE",
    goalId: row.goalId ?? null,
    challengeMemberId: null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.createdAt).toISOString(),
  }));
}

export async function createSession(_token: string | undefined, input: CreateSessionInput): Promise<WorkoutSession> {
  const row = await request<{
    id: string;
    userId: string;
    type: SessionType;
    occurredAt: string | Date;
    durationMinutes: number;
    distanceKm?: number | null;
    effort?: SessionEffort | null;
    notes?: string | null;
    goalId?: string | null;
    createdAt: string | Date;
  }>("/workouts", {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      durationMinutes: Math.round(input.durationSeconds / 60),
      distanceKm: input.distanceMeters == null ? null : input.distanceMeters / 1000,
      effort: input.effort,
      notes: input.notes,
      goalId: input.goalId,
    }),
  });

  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    occurredAt: new Date(row.occurredAt).toISOString(),
    durationSeconds: row.durationMinutes * 60,
    distanceMeters: row.distanceKm == null ? null : row.distanceKm * 1000,
    effort: row.effort ?? null,
    notes: row.notes ?? null,
    visibility: "PRIVATE",
    goalId: row.goalId ?? null,
    challengeMemberId: null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.createdAt).toISOString(),
  };
}
export type CommitmentStatus = "PENDING" | "MOVED" | "INJURED";

export type DailyCommitment = {
  id: string;
  userId: string;
  commitmentDate: string;
  status: CommitmentStatus;
  createdAt: string;
  updatedAt: string;
};

export async function saveDailyCommitment(
  status: CommitmentStatus,
  commitmentDate = new Date().toISOString()
): Promise<DailyCommitment> {
  return request<DailyCommitment>("/commitments", {
    method: "POST",
    body: JSON.stringify({
      status,
      commitmentDate,
    }),
  });
}
export async function getDailyCommitment(): Promise<DailyCommitment | null> {
  const response = await fetch("/api/commitments", {
    credentials: "include",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorData = data as ApiErrorResponse | null;
    throw new Error(
      errorData?.error?.message ||
      `Request failed with status ${response.status}`
    );
  }

  return Array.isArray(data) ? data[0] ?? null : data;
}

export type VerificationProof = {
  id: string;
  pathname: string;
  proofMethod: "video" | "watch";
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
};

export async function getLatestVideoProof(): Promise<VerificationProof | null> {
  return request<VerificationProof | null>("/verification/video");
}