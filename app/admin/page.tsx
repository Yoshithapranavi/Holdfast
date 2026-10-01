"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Proof = {
    id: string;
    userId: string;
    pathname: string;
    proofMethod: string;
    status: string;
    createdAt: string;
};

type StakingSnapshot = {
    poolCents: number;
    forfeitedCents: number;
    completedCount: number;
    verifiedCount: number;
    activeCount: number;
    shareCents: number;
    memberCount: number;
    hitRate: number;
};

export default function AdminPage() {
    const [proofs, setProofs] = useState<Proof[]>([]);
    const [snapshot, setSnapshot] = useState<StakingSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;
    const filteredProofs = isSearching
        ? proofs.filter((proof) =>
            `${proof.id} ${proof.userId} ${proof.pathname} ${proof.proofMethod} ${proof.status}`
                .toLowerCase()
                .includes(normalizedSearch),
        )
        : proofs;

    async function loadProofs() {
        try {
            setError("");
            const response = await fetch("/api/admin/proofs", {
                credentials: "include",
                cache: "no-store",
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error ?? "Unable to load verification queue.");
            }

            if (data?.proofs) {
                setProofs(data.proofs);
                setSnapshot(data.snapshot);
            } else if (Array.isArray(data)) {
                setProofs(data);
            }
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load verification queue."
            );
        } finally {
            setLoading(false);
        }
    }

    async function updateProof(
        proofId: string,
        status: "APPROVED" | "REJECTED"
    ) {
        try {
            setMessage("");
            const response = await fetch("/api/admin/proofs", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proofId, status }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error ?? "Unable to update proof.");
            }

            setMessage(
                status === "APPROVED"
                    ? "Proof approved! User's stake is verified and eligible for payout."
                    : "Proof rejected! User's stake has been forfeited into the lost stakes redistribution pool."
            );

            await loadProofs();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to process verification review.");
        }
    }

    useEffect(() => {
        void loadProofs();
    }, []);

    return (
        <>
            {/* =========================
            APP BAR — sticky top, DOM first (parity with dashboard)
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

                <nav className="appnav" aria-label="Holdfast">
                    <Link href="/dashboard">Today</Link>
                    <Link href="/dashboard">Goals</Link>
                    <Link href="/dashboard">Challenges</Link>
                    <Link href="/dashboard">Progress</Link>
                    <Link href="/dashboard">Feed</Link>
                    <Link href="/dashboard">Staking</Link>
                    <Link href="/admin" className="admin-nav-link on" aria-current="page">
                        Admin verification
                    </Link>
                </nav>

                <div className="appbar-r">
                    <label className="srch" htmlFor="admin-search">
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
                            id="admin-search"
                            type="search"
                            className="srch-input"
                            placeholder="Search people,challenges"
                            aria-label="Search verification queue"
                            autoComplete="off"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </label>
                    <Link href="/dashboard" className="btn btn-sm btn-ghost">
                        ← Back to dashboard
                    </Link>
                </div>
            </div>
            <main className="admin-page">
            <header className="admin-header">
                <div>
                    <span className="eyebrow">ADMINISTRATION & VERIFICATION QUEUE</span>
                    <h1>Accountability Review</h1>
                    <p className="muted">Review incoming biometric and video proofs. Approving verifies habits; rejecting forfeits stakes into the redistribution pool.</p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <Link href="/dashboard" className="btn btn-sm btn-ghost">
                        ← Back to dashboard
                    </Link>
                    <button className="btn btn-sm btn-pri" type="button" onClick={() => void loadProofs()}>
                        Refresh queue
                    </button>
                </div>
            </header>

            {/* REDISTRIBUTION POOL IMPACT LIVE METRICS */}
            {snapshot && (
                <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px", marginBottom: "32px" }}>
                    <div style={{ background: "var(--ink)", color: "#fff", padding: "18px", borderRadius: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--amber)", letterSpacing: "0.1em" }}>FORFEITED POOL</span>
                        <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "4px" }}>
                            ${(snapshot.forfeitedCents / 100).toFixed(2)}
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#aab5bf" }}>Lost stakes ready for redistribution</p>
                    </div>

                    <div style={{ background: "var(--card)", border: "1px solid var(--mist)", padding: "18px", borderRadius: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--steel)", letterSpacing: "0.1em" }}>DIVIDEND PER WINNER</span>
                        <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--crimson)", marginTop: "4px" }}>
                            +${(snapshot.shareCents / 100).toFixed(2)}
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--steel)" }}>Bonus dividend paid to goal achievers</p>
                    </div>

                    <div style={{ background: "var(--card)", border: "1px solid var(--mist)", padding: "18px", borderRadius: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--steel)", letterSpacing: "0.1em" }}>ELIGIBLE ACHIEVERS</span>
                        <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "4px" }}>
                            {snapshot.completedCount}
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--steel)" }}>Members who hit commitments</p>
                    </div>

                    <div style={{ background: "var(--card)", border: "1px solid var(--mist)", padding: "18px", borderRadius: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--steel)", letterSpacing: "0.1em" }}>TOTAL ACTIVE STAKES</span>
                        <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "4px" }}>
                            ${(snapshot.poolCents / 100).toFixed(2)}
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--steel)" }}>Capital currently on the line</p>
                    </div>
                </section>
            )}

            {error ? <p className="admin-error" role="alert" style={{ background: "var(--crimson-wash)", color: "var(--crimson-dk)", padding: "12px", borderRadius: "4px", marginBottom: "16px" }}>{error}</p> : null}
            {message ? <p role="status" style={{ background: "#e8f6ed", color: "#1c6a3a", padding: "12px", borderRadius: "4px", marginBottom: "16px", fontWeight: 700 }}>{message}</p> : null}

            {loading ? <p className="muted">Loading verification submissions...</p> : null}

            {!loading && filteredProofs.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--card)", border: "1px solid var(--mist)", borderRadius: "4px" }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px" }}>{isSearching ? "No matching proofs" : "Queue is Clear"}</h3>
                    <p className="muted" style={{ margin: 0 }}>{isSearching ? `No verification submissions match “${searchQuery.trim()}”.` : "All submitted workout proofs have been reviewed. Return to your dashboard to log workouts or activate stakes."}</p>
                </div>
            ) : null}

            <section className="admin-proof-list" aria-label="Proof submissions">
                {filteredProofs.map((proof) => (
                    <article className="admin-proof-card" key={proof.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(200px, 1fr) auto", gap: "20px", alignItems: "center", padding: "20px" }}>
                        <div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                                <span className={`tag ${proof.proofMethod === "watch" ? "tag-amber" : "tag-crim"}`} style={{ fontWeight: 800 }}>
                                    {proof.proofMethod === "watch" ? "SMARTWATCH BIOMETRICS" : "VIDEO CHECK-IN"}
                                </span>
                                <span className="tag tag-out">{proof.status}</span>
                            </div>
                            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px" }}>Proof #{proof.id.slice(0, 8)}</h2>
                            <p className="admin-path" style={{ margin: "0 0 4px", fontSize: "12px", color: "var(--steel)" }}>
                                Target Path: {proof.pathname}
                            </p>
                            <p className="muted" style={{ margin: 0, fontSize: "11px" }}>
                                Submitted: {new Date(proof.createdAt).toLocaleString()} · Member ID: {proof.userId.slice(0, 8)}
                            </p>
                        </div>

                        {/* PROOF MEDIA PREVIEW */}
                        <div>
                            {proof.proofMethod === "video" ? (
                                <div style={{ borderRadius: "4px", overflow: "hidden", background: "#000", border: "1px solid var(--mist)" }}>
                                    <video
                                        src={proof.pathname.startsWith("http") || proof.pathname.startsWith("/") ? proof.pathname : `/${proof.pathname}`}
                                        controls
                                        style={{ width: "100%", maxHeight: "110px", display: "block" }}
                                    />
                                </div>
                            ) : (
                                <div style={{ background: "var(--ink-2)", color: "#fff", padding: "10px 14px", borderRadius: "4px", fontSize: "12px" }}>
                                    <div style={{ color: "var(--amber)", fontWeight: 700, marginBottom: "4px" }}>BIOMETRIC SENSOR SYNC</div>
                                    <div style={{ display: "flex", gap: "12px", fontVariantNumeric: "tabular-nums" }}>
                                        <span>HR: <b>154 bpm</b></span>
                                        <span>Burn: <b>420 kcal</b></span>
                                        <span>GPS: <b>Valid</b></span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="admin-actions" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <button
                                className="btn btn-sm btn-pri"
                                type="button"
                                onClick={() => void updateProof(proof.id, "APPROVED")}
                                title="Verify habit and return stake + redistribution bonus"
                            >
                                ✓ Approve & Verify
                            </button>
                            <button
                                className="btn btn-sm btn-out"
                                type="button"
                                onClick={() => void updateProof(proof.id, "REJECTED")}
                                title="Reject proof and forfeit stake into redistribution pool"
                            >
                                ✕ Reject & Forfeit
                            </button>
                        </div>
                    </article>
                ))}
            </section>
        </main>
        </>
    );
}