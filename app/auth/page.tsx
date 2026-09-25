"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "../../lib/auth-client";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";
  const isForgot = mode === "forgot";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (isForgot) {
      const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/auth?reset=1` });
      setLoading(false);
      setMessage(result.error ? result.error.message || "Unable to send recovery email." : "If an account exists for that email, a password recovery link has been sent.");
      return;
    }

    const result = isLogin
      ? await authClient.signIn.email({ email: email.trim(), password })
      : await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });

    setLoading(false);
    if (result.error) {
      setMessage(result.error.message || "Unable to authenticate. Please try again.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] px-6 py-6 text-[var(--ink)] sm:px-10">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-[0.18em]"><span className="grid h-9 w-9 place-items-center bg-[var(--crimson)] text-sm text-white">H</span>HOLDFAST</Link>
        <Link href="/" className="text-sm font-semibold text-[var(--steel)] hover:text-[var(--ink)]">Back home</Link>
      </header>
      <section className="mx-auto grid max-w-[1040px] gap-10 py-14 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-24">
        <div className="hidden lg:block"><p className="mb-5 text-xs font-bold uppercase tracking-[.24em] text-[var(--crimson)]">The network for showing up</p><h1 className="max-w-md text-6xl font-extrabold leading-[.94] tracking-[-.06em]">Keep your word in public.</h1><p className="mt-7 max-w-md text-lg leading-8 text-[var(--steel)]">Join training partners who make consistency visible, practical, and harder to abandon.</p></div>
        <div className="plate mx-auto w-full max-w-[480px] p-7 sm:p-10">
          <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--crimson)]">Holdfast access</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight">{isForgot ? "Recover your password" : isLogin ? "Welcome back" : "Create your account"}</h2><p className="mt-2 text-sm text-[var(--steel)]">{isForgot ? "We’ll email you a secure password reset link." : isLogin ? "Sign in to keep your commitments moving." : "Start building a durable training habit."}</p></div>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!isLogin && !isForgot && <div><label htmlFor="name" className="mb-1.5 block text-sm font-bold">Full name</label><input id="name" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="auth-input" placeholder="Alex Morgan" /></div>}
            <div><label htmlFor="email" className="mb-1.5 block text-sm font-bold">Email address</label><input id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input" placeholder="you@example.com" /></div>
            {!isForgot && <div><label htmlFor="password" className="mb-1.5 block text-sm font-bold">Password</label><div className="password-field"><input id="password" required minLength={8} type={showPassword ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input" placeholder="At least 8 characters" /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div></div>}
            {isLogin && <button type="button" className="block text-left text-sm font-bold text-[var(--crimson)] underline underline-offset-4" onClick={() => { setMode("forgot"); setMessage(""); }}>Forgot password?</button>}
            {message && <p role="status" className="border border-[var(--crimson)] bg-[var(--crimson-wash)] px-3 py-2 text-sm text-[var(--crimson-dk)]">{message}</p>}
            <button type="submit" disabled={loading} className="w-full bg-[var(--crimson)] px-5 py-3 font-bold text-white transition hover:bg-[var(--crimson-dk)] disabled:cursor-wait">{loading ? "Working…" : isForgot ? "Send recovery link" : isLogin ? "Sign in" : "Create account"}</button>
          </form>
          <p className="mt-6 border-t border-[var(--mist)] pt-5 text-center text-sm text-[var(--steel)]">{isForgot ? "Remembered your password?" : isLogin ? "New to Holdfast?" : "Already have an account?"}{" "}<button type="button" className="font-bold text-[var(--ink)] underline underline-offset-4" onClick={() => { setMode(isForgot ? "login" : isLogin ? "register" : "login"); setMessage(""); }}>{isForgot ? "Back to sign in" : isLogin ? "Create an account" : "Sign in"}</button></p>
        </div>
      </section>
    </main>
  );
}
