"use client";

import { FormEvent, useState } from "react";
import {
    createSession,

    type SessionEffort,
    type SessionType,
    type Goal,
} from "../../lib/api";

type LogWorkoutFormProps = {
    goals: Goal[];
    onCreated: () => Promise<void>;
};

export default function LogWorkoutForm({
    goals,
    onCreated,
}: LogWorkoutFormProps) {
    const [type, setType] = useState<SessionType>("RUN");
    const [durationMinutes, setDurationMinutes] = useState("30");
    const [distanceKm, setDistanceKm] = useState("");
    const [effort, setEffort] = useState<SessionEffort>("STEADY");
    const [notes, setNotes] = useState("");
    const [goalId, setGoalId] = useState("");

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();



        const duration = Number(durationMinutes);

        if (!Number.isFinite(duration) || duration <= 0) {
            setError("Duration must be greater than 0.");
            return;
        }

        const distance = distanceKm
            ? Number(distanceKm)
            : undefined;

        if (
            distance !== undefined &&
            (!Number.isFinite(distance) || distance <= 0)
        ) {
            setError("Distance must be greater than 0.");
            return;
        }

        setSaving(true);
        setMessage("");
        setError("");

        try {
            await createSession(undefined, {
                type,
                occurredAt: new Date().toISOString(),
                durationSeconds: duration * 60,
                distanceMeters:
                    distance !== undefined ? distance * 1000 : undefined,
                effort,
                notes: notes.trim() || undefined,
                visibility: "PRIVATE",
                goalId: goalId || undefined,
                shareToFeed: false,
            });

            setMessage("Workout logged successfully.");

            setDurationMinutes("30");
            setDistanceKm("");
            setEffort("STEADY");
            setNotes("");
            setGoalId("");

            await onCreated();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to log workout."
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="workout-form-card" aria-labelledby="log-workout-title">
            <div className="workout-form-heading">
                <div>
                    <p className="eyebrow">Training log</p>
                    <h2 id="log-workout-title">Log a workout</h2>
                    <p className="workout-form-copy">Capture the work while it is fresh. Keep it simple, keep it moving.</p>
                </div>
                <span className="workout-form-badge">Today</span>
            </div>

            <form className="workout-form" onSubmit={handleSubmit}>
                <fieldset className="workout-type-fieldset">
                    <legend>Workout type</legend>
                    <div className="workout-type-grid">
                        {([
                            ["RUN", "Run", "Outdoor miles"],
                            ["STRENGTH", "Strength", "Build power"],
                            ["SWIM", "Swim", "Find your rhythm"],
                            ["CYCLE", "Cycle", "Ride it out"],
                            ["MOBILITY", "Mobility", "Move better"],
                            ["OTHER", "Other", "Make it count"],
                        ] as const).map(([value, label, hint]) => (
                            <label className={`workout-type-option ${type === value ? "selected" : ""}`} key={value}>
                                <input
                                    type="radio"
                                    name="workout-type"
                                    value={value}
                                    checked={type === value}
                                    onChange={() => setType(value)}
                                />
                                <span className="workout-type-mark" aria-hidden="true">{label.slice(0, 1)}</span>
                                <span><strong>{label}</strong><small>{hint}</small></span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="workout-fields-grid">
                    <label className="workout-field">
                        <span>Duration <small>minutes</small></span>
                        <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
                    </label>
                    <label className="workout-field">
                        <span>Distance <small>optional · km</small></span>
                        <input type="number" min="0" step="0.01" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="0.00" />
                    </label>
                    <label className="workout-field">
                        <span>Effort</span>
                        <select value={effort} onChange={(e) => setEffort(e.target.value as SessionEffort)}>
                            <option value="EASY">Easy</option><option value="STEADY">Steady</option><option value="HARD">Hard</option>
                        </select>
                    </label>
                    <label className="workout-field">
                        <span>Goal <small>optional</small></span>
                        <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                            <option value="">No goal</option>
                            {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                        </select>
                    </label>
                </div>

                <label className="workout-field">
                    <span>Notes <small>optional</small></span>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder="How did it feel?" />
                </label>

                <div className="workout-form-footer">
                    <span className="workout-form-helper">Your session stays private unless you share it.</span>
                    <button className="btn btn-pri workout-submit" type="submit" disabled={saving}>
                        {saving ? "Logging..." : "Log workout"}
                    </button>
                </div>
            </form>

            {message && <p className="form-message success" role="status">{message}</p>}
            {error && <p className="form-message error" role="alert">Error: {error}</p>}
        </section>
    );
}
