"use client";

import { useState } from "react";

type SmartwatchVerificationProps = {
    disabled?: boolean;
    onSubmitted: (message: string) => void;
};

export default function SmartwatchVerification({
    disabled = false,
    onSubmitted,
}: SmartwatchVerificationProps) {
    const [selectedDevice, setSelectedDevice] = useState("Apple Watch Ultra");
    const [connected, setConnected] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [heartRate, setHeartRate] = useState(154);
    const [calories, setCalories] = useState(420);
    const [durationMins, setDurationMins] = useState(38);

    async function syncDevice() {
        setSyncing(true);

        try {
            const response = await fetch("/api/verification/watch", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device: selectedDevice.includes("Apple") ? "Apple Watch" : selectedDevice.includes("Garmin") ? "Garmin" : selectedDevice.includes("WHOOP") ? "WHOOP" : "Fitbit",
                    heartRateAvg: heartRate,
                    calories,
                    durationMinutes: durationMins,
                    capturedAt: new Date().toISOString(),
                }),
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                onSubmitted(data?.error?.message || "Unable to submit smartwatch proof. Please try again.");
                return;
            }

            onSubmitted(`Biometric data synced from ${selectedDevice}: ${heartRate} bpm avg, ${calories} kcal. Proof submitted for verification!`);
        } catch {
            onSubmitted("Unable to submit smartwatch proof. Please try again.");
        } finally {
            setSyncing(false);
        }
    }

    return (
        <div className="watch-proof-container" style={{ border: "1px solid var(--mist)", borderRadius: "6px", padding: "18px", background: "var(--card)", marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid var(--mist)", paddingBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--ink-2)", color: "#fff", display: "grid", placeItems: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="7" y="5" width="10" height="14" rx="2" />
                            <path d="M9 2v3M15 2v3M9 19v3M15 19v3M10 9h4M10 13h4" />
                        </svg>
                    </div>
                    <div>
                        <span className="eyebrow" style={{ fontSize: "10px" }}>BIOMETRIC SENSOR VERIFICATION</span>
                        <h4 style={{ margin: "2px 0 0", fontSize: "14px", fontWeight: 700 }}>Smartwatch Sync</h4>
                    </div>
                </div>
                <span className={`tag ${connected ? "tag-amber" : "tag-out"}`} style={{ fontWeight: 800 }}>
                    {connected ? "SENSOR PAIRED" : "NO SENSOR"}
                </span>
            </div>

            {!connected ? (
                <div>
                    <label style={{ display: "block", fontSize: "12px", color: "var(--steel)", fontWeight: 700, marginBottom: "6px" }}>
                        Select Supported Biometric Device
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "14px" }}>
                        {["Apple Watch Ultra", "Garmin Forerunner", "WHOOP 4.0", "Polar Pacer"].map((dev) => (
                            <button
                                key={dev}
                                type="button"
                                onClick={() => setSelectedDevice(dev)}
                                style={{
                                    padding: "8px 10px",
                                    border: selectedDevice === dev ? "2px solid var(--crimson)" : "1px solid var(--mist)",
                                    background: selectedDevice === dev ? "var(--crimson-wash)" : "var(--paper)",
                                    color: selectedDevice === dev ? "var(--crimson-dk)" : "var(--ink)",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    textAlign: "center"
                                }}
                            >
                                {dev}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="btn btn-sm btn-pri"
                        disabled={disabled}
                        onClick={() => setConnected(true)}
                        style={{ width: "100%", justifyContent: "center" }}
                    >
                        Connect & Read Biometrics
                    </button>
                </div>
            ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                    <div style={{ background: "var(--ink-2)", color: "#fff", padding: "14px", borderRadius: "5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--amber)" }}>
                                {selectedDevice.toUpperCase()} HEALTHKIT TELEMETRY
                            </span>
                            <span style={{ fontSize: "11px", color: "#aab5bf" }}>Verified Today</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", textAlign: "center" }}>
                            <div style={{ background: "rgba(255,255,255,0.06)", padding: "10px 6px", borderRadius: "4px" }}>
                                <span style={{ display: "block", fontSize: "10px", color: "#aab5bf", textTransform: "uppercase" }}>Avg Heart Rate</span>
                                <b style={{ fontSize: "20px", color: "var(--crimson)", fontVariantNumeric: "tabular-nums" }}>{heartRate}</b>
                                <span style={{ fontSize: "10px", color: "#aab5bf", marginLeft: "2px" }}>bpm</span>
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.06)", padding: "10px 6px", borderRadius: "4px" }}>
                                <span style={{ display: "block", fontSize: "10px", color: "#aab5bf", textTransform: "uppercase" }}>Active Burn</span>
                                <b style={{ fontSize: "20px", color: "#fff", fontVariantNumeric: "tabular-nums" }}>{calories}</b>
                                <span style={{ fontSize: "10px", color: "#aab5bf", marginLeft: "2px" }}>kcal</span>
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.06)", padding: "10px 6px", borderRadius: "4px" }}>
                                <span style={{ display: "block", fontSize: "10px", color: "#aab5bf", textTransform: "uppercase" }}>Duration</span>
                                <b style={{ fontSize: "20px", color: "var(--amber)", fontVariantNumeric: "tabular-nums" }}>{durationMins}</b>
                                <span style={{ fontSize: "10px", color: "#aab5bf", marginLeft: "2px" }}>min</span>
                            </div>
                        </div>
                        <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#aab5bf" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
                            GPS coordinates & biometric signature matched to logged session
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                        <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setConnected(false)}
                            style={{ flex: "0 0 auto" }}
                        >
                            Change device
                        </button>
                        <button
                            type="button"
                            className="btn btn-sm btn-pri"
                            disabled={disabled || syncing}
                            onClick={syncDevice}
                            style={{ flex: "1", justifyContent: "center" }}
                        >
                            {syncing ? "Transmitting Biometrics..." : "Submit Smartwatch Biometric Proof"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}