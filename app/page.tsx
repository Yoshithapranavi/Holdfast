import Link from "next/link";

const principles = [
  ["01", "Commit publicly", "Put a real goal on the line and let your partners see it."],
  ["02", "Train consistently", "Log the work that keeps your promise moving forward."],
  ["03", "Stay accountable", "Build momentum with people who are in it with you."],
];

export default function Page() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-[0.18em]">
          <span className="grid h-9 w-9 place-items-center bg-[var(--crimson)] text-sm text-white">H</span>
          HOLDFAST
        </Link>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          <Link href="/auth" className="px-4 py-2 text-[var(--steel)] transition hover:text-[var(--ink)]">Sign in</Link>
          <Link href="/auth" className="bg-[var(--ink)] px-4 py-2 text-white transition hover:bg-[var(--crimson)]">Join the network</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1240px] gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.1fr_.9fr] lg:items-end lg:px-10 lg:pb-28 lg:pt-24">
        <div>
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.24em] text-[var(--crimson)]">Fitness accountability staking network</p>
          <h1 className="max-w-4xl text-6xl font-extrabold leading-[0.92] tracking-[-0.06em] sm:text-7xl lg:text-8xl">Make the promise. <span className="text-[var(--crimson)]">Keep it.</span></h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-[var(--steel)]">Holdfast turns your training goals into visible commitments, backed by the people who expect you to show up.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/auth" className="bg-[var(--crimson)] px-6 py-3 font-bold text-white transition hover:bg-[var(--crimson-dk)]">Start your commitment</Link>
            <Link href="/dashboard" className="border border-[var(--mist)] bg-white px-6 py-3 font-bold transition hover:border-[var(--ink)]">View dashboard</Link>
          </div>
        </div>
        <div className="plate p-7 lg:p-9">
          <div className="flex items-start justify-between border-b border-[var(--mist)] pb-6">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--steel)]">Current commitment</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight">Build a durable habit</h2></div>
            <span className="bg-[var(--amber-wash)] px-3 py-1 text-xs font-bold text-[#966200]">ACTIVE</span>
          </div>
          <div className="py-8"><div className="flex items-end justify-between"><span className="text-6xl font-extrabold tracking-[-0.06em]">18</span><span className="pb-2 text-sm text-[var(--steel)]">days remaining</span></div><div className="mt-5 h-2 bg-[var(--mist-2)]"><div className="h-full w-[68%] bg-[var(--crimson)]" /></div></div>
          <div className="grid grid-cols-2 gap-4 border-t border-[var(--mist)] pt-6 text-sm"><div><p className="text-[var(--steel)]">This week</p><p className="mt-1 text-xl font-bold">4 / 5 sessions</p></div><div><p className="text-[var(--steel)]">Partners</p><p className="mt-1 text-xl font-bold">3 active</p></div></div>
        </div>
      </section>

      <section className="border-y border-[var(--mist)] bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-0 px-6 lg:grid-cols-3 lg:px-10">
          {principles.map(([number, title, description]) => <div key={number} className="border-b border-[var(--mist)] py-8 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0"><p className="text-xs font-bold text-[var(--crimson)]">{number}</p><h2 className="mt-5 text-2xl font-extrabold">{title}</h2><p className="mt-3 max-w-xs text-[var(--steel)]">{description}</p></div>)}
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-col gap-3 px-6 py-8 text-sm text-[var(--steel)] sm:flex-row sm:items-center sm:justify-between lg:px-10"><span>Holdfast — show up for what you said you would do.</span><Link href="/auth" className="font-bold text-[var(--ink)] hover:text-[var(--crimson)]">Get started →</Link></footer>
    </main>
  );
}
