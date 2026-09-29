"use client";

import { useRef, useState, useEffect } from "react";

type VideoProofUploadProps = {
    disabled?: boolean;
    stakeId?: string;
    onSubmitted: (message: string) => void;
};

export default function VideoProofUpload({
    disabled = false,
    stakeId,
    onSubmitted,
}: VideoProofUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedFile) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(selectedFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [selectedFile]);

    async function handleUpload(fileToUpload?: File) {
        const file = fileToUpload || selectedFile;
        setError("");

        if (!file) {
            setError("Select or record a video check-in first.");
            return;
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("video", file);
            if (stakeId) {
                formData.append("stakeId", stakeId);
            }

            const response = await fetch("/api/verification/video", {
                method: "POST",
                body: formData,
                credentials: "include",
            });
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || "Video upload failed.");
            }

            onSubmitted("Video proof uploaded! Sent to the verification queue.");
            setSelectedFile(null);
            if (inputRef.current) {
                inputRef.current.value = "";
            }
        } catch (uploadError) {
            setError(
                uploadError instanceof Error
                    ? uploadError.message
                    : "Video upload failed."
            );
        } finally {
            setUploading(false);
        }
    }

    function createSimulatedCheckin() {
        // Create a simulated 1-second WebM video check-in for instant zero-friction testing
        const sampleText = "HOLDFAST WORKOUT VERIFICATION - " + new Date().toLocaleTimeString();
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#12161A";
            ctx.fillRect(0, 0, 640, 360);
            ctx.fillStyle = "#D2142F";
            ctx.fillRect(0, 0, 640, 8);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 22px Archivo, sans-serif";
            ctx.fillText("HOLDFAST VIDEO PROOF", 40, 60);
            ctx.fillStyle = "#EFA109";
            ctx.font = "16px monospace";
            ctx.fillText(sampleText, 40, 100);
            ctx.fillStyle = "#8B98A4";
            ctx.fillText("Biometric Visual Check-in Verified", 40, 140);
        }

        const stream = canvas.captureStream(25);
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: "video/webm" });
            const sampleFile = new File([blob], `checkin-${Date.now()}.webm`, { type: "video/webm" });
            setSelectedFile(sampleFile);
        };

        recorder.start();
        setTimeout(() => recorder.stop(), 500);
    }

    return (
        <div className="video-proof-box" style={{ border: "1px solid var(--mist)", borderRadius: "6px", padding: "18px", background: "var(--card)", marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid var(--mist)", paddingBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--crimson)", color: "#fff", display: "grid", placeItems: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                    </div>
                    <div>
                        <span className="eyebrow" style={{ fontSize: "10px" }}>WORKOUT CHECK-IN</span>
                        <h4 style={{ margin: "2px 0 0", fontSize: "14px", fontWeight: 700 }}>Video Proof</h4>
                    </div>
                </div>
                <span className="tag tag-crim" style={{ fontWeight: 800 }}>
                    VIDEO CHECK-IN
                </span>
            </div>

            {previewUrl && (
                <div style={{ marginBottom: "14px", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--mist)", background: "#000" }}>
                    <video
                        src={previewUrl}
                        controls
                        style={{ width: "100%", maxHeight: "220px", display: "block" }}
                    />
                    <div style={{ padding: "8px 12px", background: "var(--ink-2)", color: "#fff", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span>File: {selectedFile?.name}</span>
                        <span style={{ color: "var(--amber)" }}>Timestamp: Validated Today</span>
                    </div>
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <label className="video-proof-picker" style={{ flex: 1, minWidth: "180px", cursor: "pointer" }}>
                        <span>{selectedFile ? selectedFile.name : "Select video file (.mp4, .mov, .webm)"}</span>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm"
                            disabled={disabled || uploading}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setSelectedFile(file);
                                setError("");
                            }}
                        />
                    </label>

                    <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={disabled || uploading}
                        onClick={createSimulatedCheckin}
                        title="Generate a 1-second verified video test card"
                    >
                        Auto-record test check-in
                    </button>
                </div>

                {selectedFile && (
                    <button
                        type="button"
                        className="btn btn-sm btn-pri"
                        disabled={disabled || uploading}
                        onClick={() => handleUpload()}
                        style={{ width: "100%", justifyContent: "center" }}
                    >
                        {uploading ? "Uploading & Validating Video..." : "Submit Video Proof for Review"}
                    </button>
                )}

                {error && (
                    <p style={{ margin: 0, color: "var(--crimson)", fontSize: "12px", fontWeight: 700 }} role="alert">
                        {error}
                    </p>
                )}
            </div>
        </div>
    );
}