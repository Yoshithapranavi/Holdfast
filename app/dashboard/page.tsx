"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuth } from "../providers";
import {
    cancelGoal,
    createGoal,
    getMyGoals,
    getMySessions,
    getToken,
    saveDailyCommitment,
    getDailyCommitment,
    getLatestVideoProof,
    type VerificationProof,
    type DailyCommitment,
    type Goal,
    type WorkoutSession,
} from "../../lib/api";
import LogWorkoutForm from "../components/LogWorkoutForm";
import VideoProofUpload from "../components/VideoProofUpload";
import SmartwatchVerification from "../components/SmartwatchVerification";

function formatDate(date: Date) {
    return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
    }).format(date);
}

function formatShortDate(value: string) {
    return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(new Date(value));
}

function formatSessionDate(value: string) {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function formatDuration(seconds: number) {
    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
        return `${minutes}:00`;
    }

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    return `${hours}:${String(remaining).padStart(2, "0")}`;
}

function formatGoalValue(value: number | null | undefined) {
    const numericValue =
        typeof value === "number" && Number.isFinite(value) ? value : 0;

    if (Number.isInteger(numericValue)) {
        return String(numericValue);
    }

    return numericValue.toFixed(1);
}

function getInitials(name: string) {
    return (
        name
            .trim()
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "HF"
    );
}

function getWeekStart(date: Date) {
    const result = new Date(date);
    const day = result.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;

    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() + mondayOffset);

    return result;
}

function sameDay(first: Date, second: Date) {
    return (
        first.getFullYear() === second.getFullYear() &&
        first.getMonth() === second.getMonth() &&
        first.getDate() === second.getDate()
    );
}

function getWeekDays(sessions: WorkoutSession[]) {
    const today = new Date();
    const monday = getWeekStart(today);

    const labels = ["M", "T", "W", "T", "F", "S", "S"];

    return labels.map((label, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);

        const hasSession = sessions.some((session) =>
            sameDay(new Date(session.occurredAt), date),
        );

        const isToday = sameDay(today, date);
        const isPast = date < today && !isToday;


        return {
            label,
            date,
            hasSession,
            isToday,
            isPast,
        };
    });
}

function getWeeklySessionCounts(sessions: WorkoutSession[]) {
    const currentMonday = getWeekStart(new Date());

    return Array.from({ length: 8 }, (_, index) => {
        const weekStart = new Date(currentMonday);
        weekStart.setDate(currentMonday.getDate() - (7 - index) * 7);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        return sessions.filter((session) => {
            const date = new Date(session.occurredAt);
            return date >= weekStart && date < weekEnd;
        }).length;
    });
}

function getSessionTitle(session: WorkoutSession) {
    const type = session.type.toLowerCase();

    if (type === "run") {
        return "Run";
    }

    if (type === "cycle") {
        return "Cycling";
    }

    if (type === "swim") {
        return "Swim";
    }

    if (type === "strength") {
        return "Strength";
    }

    return session.type;
}

function SessionIcon({ type }: { type: WorkoutSession["type"] }) {
    if (type === "RUN") {
        return (
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#12161A"
                strokeWidth="2"
                aria-hidden="true"
            >
                <circle cx="13" cy="4" r="2" />
                <path d="M7 20l3-5 4 2 2-6" />
                <path d="m16 11 4-1" />
            </svg>
        );
    }

    if (type === "CYCLE") {
        return (
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#12161A"
                strokeWidth="1.8"
                aria-hidden="true"
            >
                <circle cx="6" cy="17" r="4" />
                <circle cx="18" cy="17" r="4" />
                <path d="M6 17l4-8h4l4 8M10 9l-2-3M14 9l3-3" />
            </svg>
        );
    }

    if (type === "SWIM") {
        return (
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#12161A"
                strokeWidth="1.8"
                aria-hidden="true"
            >
                <path d="M3 9c3 0 3-2 6-2s3 2 6 2 3-2 6-2" />
                <path d="M3 15c3 0 3-2 6-2s3 2 6 2 3-2 6-2" />
                <path d="M3 20c3 0 3-2 6-2s3 2 6 2 3-2 6-2" />
            </svg>
        );
    }

    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#12161A"
            strokeWidth="1.8"
            aria-hidden="true"
        >
            <path d="M6 5v14M18 5v14M6 8h12M6 16h12" />
        </svg>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, loading, logout } = useAuth();

    const [goals, setGoals] = useState<Goal[]>([]);
    const [sessions, setSessions] = useState<WorkoutSession[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [dailyCommitment, setDailyCommitment] =
        useState<DailyCommitment | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [showLogForm, setShowLogForm] = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [goalTitle, setGoalTitle] = useState("");
    const [goalTarget, setGoalTarget] = useState("10");
    const [goalUnit, setGoalUnit] = useState("sessions");
    const [goalSaving, setGoalSaving] = useState(false);
    const [cancellingGoalId, setCancellingGoalId] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [activeView, setActiveView] = useState<"today" | "goals" | "challenges" | "progress" | "feed" | "staking">("today");
    const [stakeAmount, setStakeAmount] = useState("25");
    const [proofMethod, setProofMethod] = useState<"watch" | "video">("watch");
    const [stakeStatus, setStakeStatus] = useState<"idle" | "staked" | "submitted">("idle");
    const [stakeLoading, setStakeLoading] = useState(false);
    const [stakingSnapshot, setStakingSnapshot] = useState<{
        poolCents: number;
        forfeitedCents: number;
        completedCount: number;
        verifiedCount: number;
        activeCount: number;
        shareCents: number;
        myShareCents: number;
        memberCount: number;
        hitRate: number;
        myStake: {
            id: string;
            amountCents: number;
            goalId?: string | null;
            proofMethod: "watch" | "video";
            status: "ACTIVE" | "SUBMITTED" | "VERIFIED" | "COMPLETED" | "FORFEITED";
            createdAt: string;
        } | null;
    } | null>(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [latestVideoProof, setLatestVideoProof] =
        useState<VerificationProof | null>(null);

    function selectView(view: typeof activeView) {
        setActiveView(view);
        setMessage("");
        if (view === "today") {
            setShowGoalForm(false);
        }
    }

    async function loadStakingData() {
        try {
            const res = await fetch("/api/staking", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setStakingSnapshot(data);
                if (data.myStake) {
                    setProofMethod(data.myStake.proofMethod);
                    if (data.myStake.status === "SUBMITTED" || data.myStake.status === "VERIFIED" || data.myStake.status === "COMPLETED") {
                        setStakeStatus("submitted");
                    } else if (data.myStake.status === "ACTIVE") {
                        setStakeStatus("staked");
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load staking data", e);
        }
    }

    async function loadDashboard() {
        if (!user) return;

        setLoadingData(true);

        try {
            const [goalData, sessionData, commitmentData, proofData] = await Promise.all([
                getMyGoals(undefined, "ACTIVE"),
                getMySessions(undefined, 100),
                getDailyCommitment(),
                getLatestVideoProof(),
            ]);

            setGoals(goalData);
            setSessions(sessionData);
            setDailyCommitment(commitmentData);
            setLatestVideoProof(proofData);
            await loadStakingData();
            setMessage("");
        } catch (error) {
            console.error("Failed to load dashboard:", error);
            setMessage(error instanceof Error ? error.message : "Unable to load dashboard data.");
        } finally {
            setLoadingData(false);
        }
    }

    async function handleCreateStake(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const amount = Number(stakeAmount);
        if (!Number.isInteger(amount) || amount < 1) {
            setMessage("Enter a whole dollar stake amount of at least $1.");
            return;
        }

        const targetGoalId = goals[0]?.id;
        if (!targetGoalId) {
            setMessage("Create an active goal before staking — your stake needs a goal to protect.");
            return;
        }

        setStakeLoading(true);
        setMessage("");

        try {
            const response = await fetch("/api/staking/checkout", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, proofMethod, goalId: targetGoalId }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error?.message || "Failed to create stake.");
            }

            if (data?.url) {
                window.location.href = data.url;
                return;
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to place stake.");
        } finally {
            setStakeLoading(false);
        }
    }

    async function handleCreateGoal(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const targetValue = Number(goalTarget);
        if (!goalTitle.trim() || !Number.isFinite(targetValue) || targetValue <= 0) {
            setMessage("Enter a goal title and a target greater than zero.");
            return;
        }
        setGoalSaving(true);
        setMessage("");
        try {
            const newGoal = {
                id: crypto.randomUUID(),
                title: goalTitle.trim(),
                metric: goalUnit === "sessions" ? "FREQUENCY" as const : "CUSTOM" as const,
                currentValue: 0,
                targetValue,
                unit: goalUnit.trim() || "sessions",
                visibility: "PRIVATE" as const,
                status: "ACTIVE" as const,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            const savedGoal = await createGoal(undefined, {
                title: newGoal.title,
                metric: newGoal.metric,
                targetValue: newGoal.targetValue,
                unit: newGoal.unit,
                visibility: newGoal.visibility,
            });

            setGoals((current) => [savedGoal, ...current]);
            setGoalTitle("");
            setGoalTarget("10");
            setShowGoalForm(false);
            setMessage("Goal created successfully.");
            await loadDashboard();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to create goal.");
        } finally {
            setGoalSaving(false);
        }
    }

    async function handleCancelGoal(goal: Goal) {
        if (cancellingGoalId) {
            return;
        }

        const confirmed =
            typeof window === "undefined"
                ? true
                : window.confirm(
                      `Cancel "${goal.title}"? Your workout history is kept, but this commitment will no longer be active.`,
                  );

        if (!confirmed) {
            return;
        }

        setCancellingGoalId(goal.id);
        setMessage("");
        try {
            await cancelGoal(goal.id);
            setGoals((current) => current.filter((item) => item.id !== goal.id));
            setMessage(`Cancelled "${goal.title}". Your history was kept.`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to cancel goal.");
        } finally {
            setCancellingGoalId(null);
        }
    }

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/auth");
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (user) {
            loadDashboard();

            if (typeof window !== "undefined") {
                const params = new URLSearchParams(window.location.search);
                const stakingParam = params.get("staking");
                const sessionId = params.get("session_id");

                if (stakingParam === "success" && sessionId) {
                    fetch("/api/staking/confirm", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId }),
                    })
                        .then((res) => res.json())
                        .then((data) => {
                            if (data?.error?.message) {
                                setMessage(data.error.message);
                            } else {
                                const amountCents = data.amountCents;
                                setMessage(`Payment successful! Your $${(amountCents / 100).toFixed(2)} stake is now active.`);
                                window.history.replaceState({}, "", "/dashboard");
                                loadDashboard();
                            }
                        })
                        .catch(() => {
                            setMessage("Unable to confirm Stripe stake payment.");
                        });
                } else if (stakingParam === "cancelled") {
                    setMessage("Staking checkout was cancelled.");
                    window.history.replaceState({}, "", "/dashboard");
                }
            }
        }
    }, [user]);

    const today = new Date();

    const weekDays = useMemo(
        () => getWeekDays(sessions),
        [sessions],
    );

    const weeklyCounts = useMemo(
        () => getWeeklySessionCounts(sessions),
        [sessions],
    );

    const thisWeekSessions = useMemo(() => {
        const monday = getWeekStart(new Date());

        const nextMonday = new Date(monday);
        nextMonday.setDate(monday.getDate() + 7);

        return sessions.filter((session) => {
            const date = new Date(session.occurredAt);
            return date >= monday && date < nextMonday;
        }).length;
    }, [sessions]);

    const todaySessions = useMemo(
        () =>
            sessions.filter((session) =>
                sameDay(new Date(session.occurredAt), today),
            ),
        [sessions, today],
    );

    const activeGoal = goals[0];

    const remainingGoalValue = activeGoal
        ? Math.max(
            0,
            activeGoal.targetValue - activeGoal.currentValue,
        )
        : 0;

    const activeGoalPercent = activeGoal
        ? activeGoal.targetValue > 0
            ? Math.min(
                100,
                Math.round(
                    (activeGoal.currentValue / activeGoal.targetValue) * 100,
                ),
            )
            : 0
        : 0;

    const completedGoals = goals.filter(
        (goal) =>
            goal.targetValue > 0 &&
            goal.currentValue >= goal.targetValue,
    ).length;

    const maxWeeklyCount = Math.max(
        1,
        ...weeklyCounts,
    );

    const normalizedSearch = searchQuery.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;

    const filteredGoals = useMemo(() => {
        if (!normalizedSearch) {
            return goals;
        }

        return goals.filter((goal) =>
            `${goal.title} ${goal.unit} ${goal.metric}`
                .toLowerCase()
                .includes(normalizedSearch),
        );
    }, [goals, normalizedSearch]);

    const filteredSessions = useMemo(() => {
        if (!normalizedSearch) {
            return sessions;
        }

        return sessions.filter((session) => {
            const haystack =
                `${getSessionTitle(session)} ${session.type} ${session.notes ?? ""} ${session.effort ?? ""}`.toLowerCase();

            return haystack.includes(normalizedSearch);
        });
    }, [sessions, normalizedSearch]);

    if (loading || !user) {
        return (
            <main className="shell sec">
                <div className="plate" style={{ padding: "40px" }}>
                    <p className="muted">Loading Holdfast...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="sec shell" id="dash">
            {/* =========================
            APP BAR
           ========================= */}

                <div className="appbar">
                    <div className="mark">
                        <svg
                            className="knot"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M4 6h6a5 5 0 0 1 0 10H8"
                                stroke="#D2142F"
                                strokeWidth="3"
                            />

                            <path
                                d="M20 18h-6a5 5 0 0 1 0-10h2"
                                stroke="#12161A"
                                strokeWidth="3"
                            />
                        </svg>

                        HOLDFAST
                    </div>

                    <nav className="appnav">
                        <button
                            type="button"
                            className={activeView === "today" ? "on" : ""}
                            onClick={() => selectView("today")}
                        >
                            Today
                        </button>

                        <button
                            type="button"
                            className={activeView === "goals" ? "on" : ""}
                            onClick={() => selectView("goals")}
                        >
                            Goals
                        </button>

                        <button type="button" onClick={() => selectView("challenges")} className={activeView === "challenges" ? "on" : ""}>
                            Challenges
                        </button>

                        <button type="button" onClick={() => selectView("progress")} className={activeView === "progress" ? "on" : ""}>
                            Progress
                        </button>

                        <button type="button" onClick={() => selectView("feed")} className={activeView === "feed" ? "on" : ""}>
                            Feed
                        </button>

                        <button type="button" onClick={() => selectView("staking")} className={activeView === "staking" ? "on" : ""}>
                            Staking
                        </button>
                        <a className="admin-nav-link" href="/admin">
                            Admin verification
                        </a>
                    </nav>

                    <div className="appbar-r">
                        <label className="srch" htmlFor="dashboard-search">
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                            </svg>

                            <input
                                id="dashboard-search"
                                type="search"
                                className="srch-input"
                                placeholder="Search people,challenges"
                                aria-label="Search goals and sessions"
                                autoComplete="off"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                            />
                        </label>

                        <button
                            type="button"
                            className="bell"
                            aria-label="Notifications"
                            onClick={() => setShowNotifications((value) => !value)}
                            aria-expanded={showNotifications}
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                aria-hidden="true"
                            >
                                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                                <path d="M13.7 21a22 22 0 0 1-3.4 0" />
                            </svg>

                            <i />
                        </button>
                        {showNotifications && <div className="notification-popover" role="dialog" aria-label="Notifications"><span className="eyebrow">Notifications</span><strong>{activeGoal ? `${activeGoal.title} is ${activeGoalPercent}% complete` : "No active commitment"}</strong><span>{todaySessions.length ? "Today’s workout is logged and ready to review." : "Log a workout today to keep your commitment moving."}</span><button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowNotifications(false)}>Close</button></div>}

                        <div className="profile-menu-wrap">
                            <button type="button" className="av av-28 a-nf profile-avatar-button" aria-label="Open profile" aria-expanded={showProfile} onClick={() => setShowProfile((value) => !value)}>
                                {getInitials(user.name)}
                            </button>
                            {showProfile && <div className="profile-popover" role="dialog" aria-label="Your profile"><span className="eyebrow">Your profile</span><strong>{user.name}</strong><span>{user.email || "No email available"}</span><small>@{user.handle}</small><button type="button" className="btn btn-sm btn-ghost" onClick={async () => { await logout(); router.replace("/auth"); }}>Sign out</button></div>}
                        </div>
                    </div>
                </div>

            {/* =========================
          SECTION HEADER
         ========================= */}

            <div className="sec-head">
                <div className="sec-no num">03</div>

                <div>
                    <h2 className="sec-title">
                        Dashboard — the day sheet
                    </h2>

                    <p className="sec-task">
                        Task: <b>do the one thing today asks for.</b>{" "}
                        The top band carries a single next action; everything
                        below is evidence, not decoration. No metric-card row,
                        no rings — consistency is tallied the way a coach would
                        mark a wall chart.
                    </p>
                </div>
            </div>

            <div className={`plate ${activeView !== "today" ? "is-subview" : ""}`}>
                {activeView !== "today" && (
                    <section className="dashboard-view-panel" aria-live="polite">
                        <div className="view-panel-head">
                            <div>
                                <span className="eyebrow">Workspace</span>
                                <h3 className="disp view-panel-title">
                                    {activeView === "goals" && "Goals & commitments"}
                                    {activeView === "challenges" && "Challenge progress"}
                                    {activeView === "progress" && "Your progress"}
                                    {activeView === "feed" && "Activity feed"}
                                    {activeView === "staking" && "Accountability staking"}
                                </h3>
                                <p className="muted view-panel-copy">
                                    {activeView === "goals" && "Set a measurable commitment and keep it visible."}
                                    {activeView === "challenges" && "Stay accountable with simple weekly challenges."}
                                    {activeView === "progress" && "Your logged sessions, shown as evidence over time."}
                                    {activeView === "feed" && "A private record of your recent activity."}
                                    {activeView === "staking" && "Put a small financial stake behind a workout commitment. Proof is reviewed before rewards are distributed."}
                                </p>
                            </div>
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectView("today")}>Back to today</button>
                        </div>

                        {activeView === "goals" && (
                            <div className="view-stack">
                                <form className="goal-form goal-form-card" onSubmit={handleCreateGoal}>
                                    <div className="goal-form-grid">
                                        <label>Goal title<input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Run consistently" required /></label>
                                        <label>Target<input type="number" min="1" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} required /></label>
                                        <label>Unit<input value={goalUnit} onChange={(event) => setGoalUnit(event.target.value)} placeholder="sessions" required /></label>
                                    </div>
                                    <button className="btn btn-pri btn-sm" type="submit" disabled={goalSaving}>{goalSaving ? "Saving..." : "Create goal"}</button>
                                </form>
                                <div className="view-list">
                                    {filteredGoals.length === 0 ? <div className="empty-state"><strong>{isSearching ? "No matching goals." : "No goals yet."}</strong><span>{isSearching ? `No commitments match “${searchQuery.trim()}”.` : "Create your first commitment above."}</span></div> : filteredGoals.map((goal) => {
                                        const currentValue =
                                            typeof goal.currentValue === "number" && Number.isFinite(goal.currentValue)
                                                ? goal.currentValue
                                                : 0;

                                        const targetValue =
                                            typeof goal.targetValue === "number" && Number.isFinite(goal.targetValue)
                                                ? goal.targetValue
                                                : 0;

                                        const percent =
                                            targetValue > 0
                                                ? Math.min(100, Math.round((currentValue / targetValue) * 100))
                                                : 0;

                                        return (
                                            <div className="view-list-row" key={goal.id}>
                                                <div>
                                                    <strong>{goal.title}</strong>
                                                    <span>
                                                        {formatGoalValue(currentValue)} / {formatGoalValue(targetValue)} {goal.unit}
                                                    </span>
                                                    <div className="bar">
                                                        <i
                                                            className={percent > 0 ? "crim" : ""}
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                    <b>{percent}%</b>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => handleCancelGoal(goal)}
                                                        disabled={cancellingGoalId === goal.id}
                                                    >
                                                        {cancellingGoalId === goal.id ? "Cancelling…" : "Cancel"}
                                                    </button>
                                                </div>
                                            </div>
                                        );

                                    })}
                                </div>
                            </div>
                        )}

                        {activeView === "challenges" && (
                            <div className="feature-grid"><div className="feature-card feature-card-accent"><span className="tag tag-amber">This week</span><h4>Consistency challenge</h4><p>Log three workouts this week to build your streak.</p><div className="progress-line"><i style={{ width: `${Math.min(100, (thisWeekSessions / 3) * 100)}%` }} /></div><strong>{thisWeekSessions} / 3 sessions</strong></div><div className="feature-card"><span className="tag">Personal best</span><h4>Keep showing up</h4><p>{sessions.length ? "Your record is growing. Add another session to keep momentum." : "Log your first session to start your challenge record."}</p><button type="button" className="btn btn-sm btn-pri" onClick={() => { setShowLogForm(true); selectView("today"); }}>Log a session</button></div></div>
                        )}

                        {activeView === "progress" && (
                            <div className="feature-grid progress-view-grid"><div className="feature-card"><span className="eyebrow">Sessions</span><strong className="feature-number">{sessions.length}</strong><p>Total workouts logged</p></div><div className="feature-card"><span className="eyebrow">This week</span><strong className="feature-number">{thisWeekSessions}</strong><p>Sessions completed this week</p></div><div className="feature-card"><span className="eyebrow">Goals</span><strong className="feature-number">{completedGoals}</strong><p>Commitments completed</p></div><div className="feature-card feature-wide"><h4>Recent rhythm</h4><div className="mini-bars">{weeklyCounts.map((count, index) => <span key={index} style={{ height: `${Math.max(8, (count / maxWeeklyCount) * 100)}%` }} title={`${count} sessions`} />)}</div></div></div>
                        )}

                        {activeView === "feed" && (
                            <div className="view-list">{filteredSessions.length === 0 ? <div className="empty-state"><strong>{isSearching ? "No matching sessions." : "Your feed is quiet."}</strong><span>{isSearching ? `No sessions match “${searchQuery.trim()}”.` : "Log a workout and it will appear here."}</span></div> : filteredSessions.map((session) => <div className="view-list-row feed-row" key={session.id}><div className="sicon"><SessionIcon type={session.type} /></div><div><strong>{getSessionTitle(session)} logged</strong><span>{formatSessionDate(session.occurredAt)} · {formatDuration(session.durationSeconds)}{session.notes ? ` · ${session.notes}` : ""}</span></div><span className="tag tag-out">{session.effort || "Logged"}</span></div>)}</div>
                        )}

                        {activeView === "staking" && (
                            <div className="staking-layout">
                                <div className="staking-card staking-card-dark">
                                    <div className="row-b">
                                        <span className="eyebrow pool-eyebrow">COMMUNITY ACCOUNTABILITY POOL</span>
                                        <span className="tag tag-amber">LIVE REDISTRIBUTION</span>
                                    </div>
                                    <strong className="stake-balance">
                                        ${(((stakingSnapshot?.forfeitedCents ?? 0)) / 100).toFixed(2)}
                                    </strong>
                                    <p className="pool-desc">
                                        Forfeited capital from missed workouts currently available for redistribution
                                    </p>
                                    <div className="pool-split">
                                        <div>
                                            <span className="pool-split-label">Dividend Per Winner</span>
                                            <b className="pool-split-val-crim">
                                                +${(((stakingSnapshot?.shareCents ?? 0)) / 100).toFixed(2)}
                                            </b>
                                        </div>
                                        <div>
                                            <span className="pool-split-label">Goal Completion Rate</span>
                                            <b className="pool-split-val-white">
                                                {stakingSnapshot?.hitRate ?? 0}%
                                            </b>
                                        </div>
                                    </div>
                                    <div className="staking-stat-row pool-stats">
                                        <span>Total Staked Across Network: <b>${(((stakingSnapshot?.poolCents ?? 0)) / 100).toFixed(2)}</b></span>
                                        <span>Achievers: <b>{stakingSnapshot?.completedCount ?? 0}</b></span>
                                    </div>
                                    <div className="progress-line">
                                        <i style={{ width: `${Math.max(5, stakingSnapshot?.hitRate ?? 0)}%` }} />
                                    </div>
                                </div>

                                <div className="staking-card staking-form" style={{ background: "var(--card)" }}>
                                    {stakingSnapshot?.myStake && ["ACTIVE", "SUBMITTED", "VERIFIED"].includes(stakingSnapshot.myStake.status) ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                            <div className="row-b">
                                                <span className="eyebrow">YOUR CURRENT STAKE</span>
                                                <span className={`tag ${
                                                    stakingSnapshot.myStake.status === "COMPLETED"
                                                        ? "tag-crim"
                                                        : stakingSnapshot.myStake.status === "FORFEITED"
                                                            ? "tag-out"
                                                            : "tag-amber"
                                                }`}>
                                                    {stakingSnapshot.myStake.status}
                                                </span>
                                            </div>

                                            <div className="active-balance-row">
                                                <strong className="active-balance-amt">
                                                    ${(stakingSnapshot.myStake.amountCents / 100).toFixed(2)}
                                                </strong>
                                                <span className="muted active-balance-sub">
                                                    via {stakingSnapshot.myStake.proofMethod === "watch" ? "Smartwatch Biometrics" : "Video Check-in"}
                                                </span>
                                            </div>

                                            {stakingSnapshot.myStake.status === "COMPLETED" && (
                                                <div style={{ background: "#e8f6ed", border: "1px solid #a3e635", padding: "12px", borderRadius: "4px", color: "#1c6a3a" }}>
                                                    <b style={{ display: "block", fontSize: "14px" }}>🎉 Commitment Achieved!</b>
                                                    <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                                                        Your ${(stakingSnapshot.myStake.amountCents / 100).toFixed(2)} stake is returned plus a <b>+${((stakingSnapshot.shareCents ?? 0) / 100).toFixed(2)}</b> redistribution dividend from forfeited stakes!
                                                    </p>
                                                    <div style={{ marginTop: "8px", fontWeight: 800, fontSize: "15px" }}>
                                                        Total Payout: ${((stakingSnapshot.myShareCents || (stakingSnapshot.myStake.amountCents + stakingSnapshot.shareCents)) / 100).toFixed(2)}
                                                    </div>
                                                </div>
                                            )}

                                            {stakingSnapshot.myStake.status === "FORFEITED" && (
                                                <div style={{ background: "var(--crimson-wash)", border: "1px solid var(--crimson)", padding: "12px", borderRadius: "4px", color: "var(--crimson-dk)" }}>
                                                    <b style={{ display: "block", fontSize: "14px" }}>⚠️ Commitment Forfeited</b>
                                                    <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                                                        This stake was forfeited into the community pool and redistributed to members who completed their verified workouts.
                                                    </p>
                                                </div>
                                            )}

                                            {stakingSnapshot.myStake.status === "VERIFIED" && (
                                                <div style={{ background: "var(--amber-wash)", border: "1px solid #f3d48a", padding: "12px", borderRadius: "4px", color: "#8a5b00" }}>
                                                    <b style={{ display: "block", fontSize: "14px" }}>✓ Proof Verified by Reviewer</b>
                                                    <p style={{ margin: "4px 0 0", fontSize: "12px" }}>
                                                        Continue completing your remaining goal sessions to unlock your original stake plus redistribution bonus!
                                                    </p>
                                                </div>
                                            )}

                                            {stakingSnapshot.myStake.status === "SUBMITTED" && (
                                                <div style={{ background: "var(--mist-2)", padding: "12px", borderRadius: "4px" }}>
                                                    <b style={{ display: "block", fontSize: "14px" }}>⏳ Proof Under Review</b>
                                                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--steel)" }}>
                                                        Your submission is currently in the verification queue. Admin review will confirm your habit.
                                                    </p>
                                                </div>
                                            )}

                                            {stakingSnapshot.myStake.status === "ACTIVE" && (
                                                <div style={{ background: "var(--mist-2)", padding: "12px", borderRadius: "4px" }}>
                                                    <b style={{ display: "block", fontSize: "14px" }}>⚡ Proof Required</b>
                                                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--steel)" }}>
                                                        Submit your {stakingSnapshot.myStake.proofMethod === "watch" ? "smartwatch telemetry" : "video check-in"} below to protect your capital.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <form onSubmit={handleCreateStake} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                            <div>
                                                <span className="eyebrow">COMMITMENT STAKING</span>
                                                <h4 style={{ fontSize: "18px", fontWeight: 800, margin: "2px 0 4px" }}>Put capital on your habit</h4>
                                                <p className="muted" style={{ fontSize: "12px", margin: 0 }}>
                                                    Your stake is returned with a redistribution bonus when your verified workouts meet your goal.
                                                </p>
                                            </div>

                                            <div>
                                                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                                                    Stake Amount (USD)
                                                </label>
                                                <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                                                    {["10", "25", "50", "100"].map((preset) => (
                                                        <button
                                                            key={preset}
                                                            type="button"
                                                            onClick={() => setStakeAmount(preset)}
                                                            className={`btn btn-sm ${stakeAmount === preset ? "btn-pri" : "btn-ghost"}`}
                                                            style={{ flex: 1, padding: "6px 0" }}
                                                        >
                                                            ${preset}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={stakeAmount}
                                                    onChange={(event) => setStakeAmount(event.target.value)}
                                                    required
                                                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--mist)", borderRadius: "4px" }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                                                    Verification Method
                                                </label>
                                                <select
                                                    value={proofMethod}
                                                    onChange={(event) => setProofMethod(event.target.value as "watch" | "video")}
                                                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--mist)", borderRadius: "4px", background: "var(--card)" }}
                                                >
                                                    <option value="watch">Biometric smartwatch proof (Apple Watch, Garmin, WHOOP)</option>
                                                    <option value="video">Video check-in (MP4 / WebM with timestamp)</option>
                                                </select>
                                            </div>

                                            <button className="btn btn-pri btn-sm" type="submit" disabled={stakeLoading} style={{ marginTop: "4px" }}>
                                                {stakeLoading ? "Placing Stake..." : `Stake $${stakeAmount} on this Goal`}
                                            </button>
                                        </form>
                                    )}
                                </div>

                                <div className="staking-card verification-card" style={{ gridColumn: "span 2" }}>
                                    <div style={{ width: "100%" }}>
                                        <div className="row-b" style={{ marginBottom: "8px" }}>
                                            <div>
                                                <span className="eyebrow">PROOF SUBMISSION</span>
                                                <h4 style={{ margin: "2px 0 0", fontSize: "18px", fontWeight: 800 }}>
                                                    {proofMethod === "watch" ? "Biometric Smartwatch Sync" : "Workout Video Check-in"}
                                                </h4>
                                            </div>
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button
                                                    type="button"
                                                    className={`btn btn-sm ${proofMethod === "watch" ? "btn-pri" : "btn-ghost"}`}
                                                    onClick={() => setProofMethod("watch")}
                                                >
                                                    Smartwatch
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`btn btn-sm ${proofMethod === "video" ? "btn-pri" : "btn-ghost"}`}
                                                    onClick={() => setProofMethod("video")}
                                                >
                                                    Video Check-in
                                                </button>
                                            </div>
                                        </div>

                                        <p className="muted" style={{ fontSize: "13px", margin: "0 0 16px" }}>
                                            {proofMethod === "watch"
                                                ? "Transmit heart rate telemetry, active burn calories, and duration from your paired fitness sensor."
                                                : "Record or upload a short workout check-in showing your training session."}
                                        </p>

                                        {stakingSnapshot?.myStake && stakingSnapshot.myStake.proofMethod !== proofMethod && (
                                            <p className="muted" style={{ fontSize: "12px", margin: "0 0 12px", fontWeight: 700 }} role="note">
                                                {stakingSnapshot.myStake.proofMethod === "watch"
                                                    ? "This stake requires Smartwatch proof. Switch to Smartwatch to submit for this stake."
                                                    : "This stake requires Video Check-in proof. Switch to Video Check-in to submit for this stake."}
                                            </p>
                                        )}

                                        {proofMethod === "video" ? (
                                            <VideoProofUpload
                                                disabled={false}
                                                stakeId={stakingSnapshot?.myStake?.id}
                                                onSubmitted={async (statusMessage) => {
                                                    setStakeStatus("submitted");
                                                    setMessage(statusMessage);
                                                    await loadDashboard();
                                                }}
                                            />
                                        ) : (
                                            <SmartwatchVerification
                                                disabled={false}
                                                stakeId={stakingSnapshot?.myStake?.id}
                                                onSubmitted={async (statusMessage) => {
                                                    setStakeStatus("submitted");
                                                    setMessage(statusMessage);
                                                    await loadDashboard();
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="staking-card reward-card" style={{ gridColumn: "span 2" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                                        <div>
                                            <span className="eyebrow" style={{ color: "#8a5b00" }}>REDISTRIBUTION ALGORITHM</span>
                                            <h4 style={{ fontSize: "18px", fontWeight: 800, margin: "4px 0 6px" }}>How the Stake Redistribution Works</h4>
                                            <p style={{ margin: 0, fontSize: "13px", color: "#5d6b78", lineHeight: 1.55 }}>
                                                Holdfast operates an append-only accountability pool. Members stake capital behind their weekly habit. If you miss your commitment or your proof is rejected, 100% of your stake is forfeited into the reward pool. When you hit your verified goal, you receive your <b>entire stake back PLUS an equal dividend of all lost stakes</b>.
                                            </p>
                                        </div>
                                        <Link href="/admin" className="btn btn-sm btn-ghost" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>
                                            Open Admin Queue →
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                )}
                {/* =========================
            DAY BAND
           ========================= */}

                <div className="day">
                    <div className="day-l">
                        <p className="day-date">
                            {formatDate(today)}
                        </p>

                        <h3 className="disp day-h">
                            {activeGoal ? (
                                <>
                                    {activeGoal.title}
                                    <br />
                                    {activeGoalPercent}% complete.
                                </>
                            ) : (
                                <>
                                    No active commitment.
                                    <br />
                                    Create your first goal.
                                </>
                            )}
                        </h3>

                        <p className="day-sub">
                            {activeGoal
                                ? `${formatGoalValue(
                                    activeGoal.currentValue,
                                )} of ${formatGoalValue(
                                    activeGoal.targetValue,
                                )} ${activeGoal.unit} completed.`
                                : "Create an active goal to start tracking your commitment."}
                        </p>

                        <div
                            className="row"
                            style={{
                                gap: "10px",
                                flexWrap: "wrap",
                                marginTop: "24px",
                            }}
                        >
                            <button
                                type="button"
                                className="btn btn-pri btn-lg"
                                onClick={() =>
                                    setShowLogForm((value) => !value)
                                }
                            >
                                {showLogForm
                                    ? "Close session form"
                                    : "Log this session"}
                            </button>

                            <button
                                type="button"
                                className="btn btn-lg day-b2"
                                onClick={async () => {
                                    try {
                                        const updated = await saveDailyCommitment("MOVED");
                                        setDailyCommitment(updated);
                                        setMessage("Commitment moved to tomorrow.");
                                    } catch (error) {
                                        setMessage(
                                            error instanceof Error ? error.message : "Unable to move commitment."
                                        );
                                    }
                                }}
                            >
                                Move to tomorrow

                            </button>


                            <button
                                type="button"
                                className="btn btn-lg day-b3"
                                onClick={async () => {
                                    try {
                                        const updated = await saveDailyCommitment("INJURED");
                                        setDailyCommitment(updated);
                                        setMessage("Take care. Your commitment is paused for today.");
                                    } catch (error) {
                                        setMessage(
                                            error instanceof Error ? error.message : "Unable to update commitment."
                                        );
                                    }
                                }}
                            >
                                I&apos;m injured
                            </button>
                        </div>
                        {dailyCommitment && (
                            <p role="status" aria-live="polite" className="day-sub">
                                Today&apos;s status: {dailyCommitment.status === "MOVED"
                                    ? "Moved to tomorrow"
                                    : dailyCommitment.status === "INJURED"
                                        ? "Paused because of injury"
                                        : "Pending"}
                            </p>
                        )}

                        {message && (
                            <p
                                role="status"
                                aria-live="polite"
                                className="day-sub"
                                style={{ marginTop: "16px" }}
                            >
                                {message}
                            </p>
                        )}
                    </div>

                    <div className="day-r">
                        <div
                            className="row-b"
                            style={{ marginBottom: "14px" }}
                        >
                            <span
                                className="tiny"
                                style={{
                                    color: "#9BA7B3",
                                    fontWeight: 700,
                                }}
                            >
                                This week
                            </span>

                            <span className="tag tag-amber">
                                {activeGoal
                                    ? `${formatGoalValue(
                                        remainingGoalValue,
                                    )} left`
                                    : "No goal"}
                            </span>
                        </div>

                        <div className="wk">
                            {weekDays.map((day) => {
                                let className = "wd";

                                if (day.isToday) {
                                    className += " today";
                                } else if (day.hasSession) {
                                    className += " done";
                                } else if (day.isPast) {
                                    className += " rest";
                                } else {
                                    className += " plan";
                                }

                                return (
                                    <span
                                        key={day.date.toISOString()}
                                        className={className}
                                        title={day.date.toDateString()}
                                    >
                                        {day.label}
                                    </span>
                                );
                            })}
                        </div>

                        <div className="day-streak">
                            <b className="num">
                                {thisWeekSessions}
                            </b>

                            <div>
                                <span>sessions this week</span>

                                <span
                                    className="tiny"
                                    style={{ color: "#7C8894" }}
                                >
                                    {todaySessions.length > 0
                                        ? "Session logged today"
                                        : "No session logged today"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* =========================
            LOG SESSION
           ========================= */}

                {showLogForm && (
                    <div
                        style={{
                            padding: "30px",
                            borderBottom: "1px solid var(--mist)",
                            background: "var(--card)",
                        }}
                    >
                        <div className="row-b">
                            <div>
                                <h4 className="h-sec">
                                    Log this session
                                </h4>

                                <p
                                    className="tiny muted"
                                    style={{ margin: "4px 0 0" }}
                                >
                                    Record your workout and optionally connect
                                    it to an active goal.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => setShowLogForm(false)}
                            >
                                Close
                            </button>
                        </div>

                        <div style={{ marginTop: "20px" }}>
                            <LogWorkoutForm
                                goals={goals}
                                onCreated={async () => {
                                    setMessage(
                                        "Session logged successfully.",
                                    );

                                    setShowLogForm(false);

                                    await loadDashboard();
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* =========================
            EVIDENCE BODY
           ========================= */}

                <div className="dash-body">
                    <div className="dash-main">
                        {/* OPEN COMMITMENTS */}

                        <div
                            className="row-b"
                            style={{ marginBottom: "6px" }}
                        >
                            <h4 className="h-sec">
                                Open commitments
                            </h4>

                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => setShowGoalForm((value) => !value)}
                            >
                                {showGoalForm ? "Close goal form" : "Manage goals"}
                            </button>
                        </div>

                        {showGoalForm && (
                            <form className="goal-form" onSubmit={handleCreateGoal}>
                                <div className="goal-form-grid">
                                    <label>
                                        Goal title
                                        <input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Run consistently" required />
                                    </label>
                                    <label>
                                        Target
                                        <input type="number" min="1" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} required />
                                    </label>
                                    <label>
                                        Unit
                                        <input value={goalUnit} onChange={(event) => setGoalUnit(event.target.value)} placeholder="sessions" required />
                                    </label>
                                </div>
                                <button className="btn btn-pri btn-sm" type="submit" disabled={goalSaving}>{goalSaving ? "Saving..." : "Create goal"}</button>
                            </form>
                        )}

                        {loadingData ? (
                            <div className="ledger">
                                <div className="lrow">
                                    <div>
                                        <p>Loading commitments...</p>
                                    </div>
                                </div>
                            </div>
                        ) : filteredGoals.length === 0 ? (
                            <div className="ledger">
                                <div className="lrow">
                                    <div>
                                        <h4>{isSearching ? "No matching commitments" : "No active commitments"}</h4>

                                        <p>
                                            {isSearching
                                                ? `No commitments match “${searchQuery.trim()}”.`
                                                : "Your active goals will appear here."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="ledger">
                                {filteredGoals.map((goal) => {
                                    const percent =
                                        goal.targetValue > 0
                                            ? Math.min(
                                                100,
                                                Math.round(
                                                    (goal.currentValue /
                                                        goal.targetValue) *
                                                    100,
                                                ),
                                            )
                                            : 0;

                                    return (
                                        <div
                                            className="lrow"
                                            key={goal.id}
                                        >
                                            <div>
                                                <h4>{goal.title}</h4>

                                                <p className="num">
                                                    {formatGoalValue(
                                                        goal.currentValue,
                                                    )}{" "}
                                                    /{" "}
                                                    {formatGoalValue(
                                                        goal.targetValue,
                                                    )}{" "}
                                                    {goal.unit}
                                                </p>

                                                <div
                                                    className="bar"
                                                    style={{
                                                        marginTop: "9px",
                                                        maxWidth: "420px",
                                                    }}
                                                >
                                                    <i
                                                        className={
                                                            percent > 0
                                                                ? "crim"
                                                                : ""
                                                        }
                                                        style={{
                                                            width: `${percent}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="lrow-r">
                                                <span className="tag">
                                                    {goal.metric}
                                                </span>

                                                <span
                                                    className={
                                                        percent >= 100
                                                            ? "tag tag-crim"
                                                            : "tag"
                                                    }
                                                >
                                                    {percent}%
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={() => handleCancelGoal(goal)}
                                                    disabled={cancellingGoalId === goal.id}
                                                >
                                                    {cancellingGoalId === goal.id ? "Cancelling…" : "Cancel"}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* LAST SESSIONS */}

                        <div
                            className="row-b"
                            style={{
                                margin: "30px 0 6px",
                            }}
                        >
                            <h4 className="h-sec">
                                Last sessions
                            </h4>

                            <span className="tiny">
                                {sessions.length} logged
                            </span>
                        </div>

                        {filteredSessions.length === 0 ? (
                            <div className="ledger">
                                <div className="lrow">
                                    <div>
                                        <h4>{isSearching ? "No matching sessions" : "No sessions yet"}</h4>

                                        <p>
                                            {isSearching
                                                ? `No sessions match “${searchQuery.trim()}”.`
                                                : "Log your first workout to start building your activity record."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="ledger">
                                {filteredSessions.slice(0, 5).map((session) => (
                                    <div
                                        className="srow"
                                        key={session.id}
                                    >
                                        <div className="sicon">
                                            <SessionIcon type={session.type} />
                                        </div>

                                        <div>
                                            <b>
                                                {getSessionTitle(session)}
                                                {session.distanceMeters != null &&
                                                    ` · ${(
                                                        session.distanceMeters / 1000
                                                    ).toFixed(2)} km`}
                                            </b>

                                            <span className="num">
                                                {formatShortDate(
                                                    session.occurredAt,
                                                )}{" "}
                                                ·{" "}
                                                {formatDuration(
                                                    session.durationSeconds,
                                                )}
                                            </span>
                                        </div>

                                        <div className="srow-note">
                                            {session.notes
                                                ? `“${session.notes}”`
                                                : session.effort
                                                    ? `Effort: ${session.effort}`
                                                    : "Workout session logged."}
                                        </div>

                                        <div>
                                            <span className="tag tag-out">
                                                {session.effort
                                                    ? session.effort
                                                    : "Logged"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* =========================
              SIDEBAR
             ========================= */}

                    <aside className="dash-side">
                        {/* ACCOUNT */}

                        <div className="side-block">
                            <h4
                                className="h-sec"
                                style={{ marginBottom: "12px" }}
                            >
                                Your account
                            </h4>

                            <div className="todo">
                                <span className="av av-28 a-nf">
                                    {getInitials(user.name)}
                                </span>

                                <div>
                                    <p>
                                        <b>{user.name}</b>
                                    </p>

                                    <p>
                                        @{user.handle}
                                    </p>

                                    <p>{user.email}</p>
                                </div>
                            </div>
                        </div>

                        {/* TODAY */}

                        <div className="side-block">
                            <h4
                                className="h-sec"
                                style={{ marginBottom: "12px" }}
                            >
                                Today
                            </h4>

                            <div className="todo">
                                <span className="tag tag-crim">
                                    {todaySessions.length}
                                </span>

                                <div>
                                    <p>
                                        <b>
                                            {todaySessions.length === 1
                                                ? "Session logged today."
                                                : todaySessions.length > 1
                                                    ? "Sessions logged today."
                                                    : "No session logged today."}
                                        </b>
                                    </p>

                                    <p>
                                        {activeGoal
                                            ? `${formatGoalValue(
                                                activeGoal.currentValue,
                                            )} / ${formatGoalValue(
                                                activeGoal.targetValue,
                                            )} ${activeGoal.unit} on active goal.`
                                            : "Create an active goal to begin tracking."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* DASHBOARD STATUS */}

                        <div className="side-block">
                            <h4
                                className="h-sec"
                                style={{ marginBottom: "12px" }}
                            >
                                Dashboard status
                            </h4>

                            <ul className="pact">
                                <li>
                                    <span className="av av-28 a-nf">
                                        {goals.length}
                                    </span>

                                    <p>
                                        <b>Active goals</b>
                                    </p>
                                </li>

                                <li>
                                    <span className="av av-28 a-tm">
                                        {completedGoals}
                                    </span>

                                    <p>
                                        <b>Goals completed</b>
                                    </p>
                                </li>

                                <li>
                                    <span className="av av-28 a-sw">
                                        {sessions.length}
                                    </span>

                                    <p>
                                        <b>Sessions logged</b>
                                    </p>
                                </li>
                            </ul>
                        </div>

                        {/* HOLDFAST */}

                        <div className="side-block up">
                            <span
                                className="tag tag-amber"
                                style={{ marginBottom: "10px" }}
                            >
                                Holdfast
                            </span>

                            <h4
                                className="disp-tight"
                                style={{
                                    fontSize: "20px",
                                    marginBottom: "6px",
                                }}
                            >
                                Keep the record honest.
                            </h4>

                            <p
                                className="tiny muted"
                                style={{ margin: 0 }}
                            >
                                Log consistently. Keep your commitments
                                visible. Build evidence over time.
                            </p>
                        </div>
                    </aside>
                </div>

                {/* =========================
            CONSISTENCY
           ========================= */}

                <div className="cons">
                    <div className="cons-head">
                        <div>
                            <h4 className="h-sec">
                                Sessions per week since June
                            </h4>

                            <p
                                className="tiny muted"
                                style={{ margin: "4px 0 0" }}
                            >
                                Each stroke is one logged session.
                                Recent activity is shown at the end.
                            </p>
                        </div>

                        <div className="cons-nums">
                            <div>
                                <b className="num">
                                    {thisWeekSessions}
                                </b>

                                <span>sessions this week</span>
                            </div>

                            <div>
                                <b className="num">
                                    {sessions.length}
                                </b>

                                <span>sessions</span>
                            </div>

                            <div>
                                <b className="num">
                                    {goals.length}
                                </b>

                                <span>active goals</span>
                            </div>
                        </div>
                    </div>

                    <div className="tally">
                        {weeklyCounts.map((count, index) => {
                            const height =
                                count === 0
                                    ? 0
                                    : Math.max(
                                        8,
                                        Math.min(
                                            44,
                                            (count / maxWeeklyCount) * 44,
                                        ),
                                    );

                            return (
                                <div
                                    className="tw"
                                    key={`week-${index}`}
                                >
                                    <svg
                                        width="18"
                                        height="48"
                                        viewBox="0 0 18 48"
                                        fill="none"
                                        aria-hidden="true"
                                    >
                                        <line
                                            x1="9"
                                            y1={48}
                                            x2="9"
                                            y2={48 - height}
                                            className={
                                                index ===
                                                    weeklyCounts.length - 1
                                                    ? "strokes hot"
                                                    : count === 0
                                                        ? "strokes miss"
                                                        : "strokes"
                                            }
                                            strokeWidth="4"
                                        />
                                    </svg>

                                    <b>
                                        W{index + 1}
                                    </b>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {message && (
                <div
                    className="tag tag-crim"
                    style={{
                        marginTop: "12px",
                        padding: "8px 12px",
                    }}
                >
                    {message}
                </div>
            )}
        </main>
    );
}
