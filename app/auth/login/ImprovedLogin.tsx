"use client";

import { FormEvent, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Info,
  BarChart3,
  Package,
  Users,
  TrendingUp,
} from "lucide-react";

const PILLARS = [
  { icon: BarChart3,  label: "Financial Reports",  desc: "P&L, Balance Sheet, Cash Flow" },
  { icon: Package,    label: "Inventory Control",  desc: "Multi-branch stock & transfers" },
  { icon: TrendingUp, label: "Sales & Payroll",    desc: "POS terminal, HR & PAYE" },
  { icon: Users,      label: "CRM & Suppliers",    desc: "Credit accounts & aging reports" },
];

export function ImprovedLogin({ error: initialError, notice }: { error?: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(initialError || "");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });
      if (result?.error) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
      } else {
        const session = await getSession();
        if (session?.user?.platformRole === 'SUPER_ADMIN') {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    /* ── Page shell — warm cream bg + radial blobs ── */
    <div className="relative min-h-screen overflow-hidden bg-[#f5f3ee]">

      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_88%_16%,rgba(251,146,60,0.18),transparent_22%),linear-gradient(160deg,#f7f4ef_0%,#f8fafc_52%,#eff6ff_100%)]" />
      <div className="absolute -left-24 top-20 h-56 w-56 rounded-full bg-blue-300/25 blur-3xl" />
      <div className="absolute bottom-12 right-[-2rem] h-64 w-64 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.05),transparent)]" />

      {/* ── Centered content ── */}
      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">

        {/* Card */}
        <div className="login-card-enter w-full overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-[0_45px_120px_-55px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <div className="grid lg:grid-cols-[1fr_1fr]">

            {/* ── Left — dark brand panel ───────────────────────────────── */}
            <div className="relative overflow-hidden bg-[linear-gradient(145deg,#0f172a_0%,#1d4ed8_52%,#1e3a5f_100%)] px-7 py-9 text-white sm:px-9 sm:py-11 lg:px-10 lg:py-12">
              {/* Inner radial overlays */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.18),transparent_28%)]" />
              {/* Grid texture */}
              <div className="login-surface-grid absolute inset-0 opacity-100" />

              <div className="relative flex h-full flex-col items-center justify-center gap-7 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/85 backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" />
                  PETROS Business Suite
                </div>

                {/* Icon */}
                <div className="flex h-20 w-20 items-center justify-center rounded-[26px] border border-white/15 bg-white/12 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.8)]">
                  <ShieldCheck className="h-10 w-10 text-blue-100" />
                </div>

                {/* Headline */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-200/80">
                    Secure Business Access
                  </p>
                  <h1 className="text-2xl font-extrabold leading-snug tracking-tight text-white sm:text-3xl">
                    Run your business<br />
                    <span className="text-blue-300">with confidence</span>
                  </h1>
                </div>

                {/* Feature pills */}
                <div className="grid w-full grid-cols-2 gap-2.5">
                  {PILLARS.map(({ icon: Icon, label, desc }) => (
                    <div
                      key={label}
                      className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/8 p-3 text-left backdrop-blur-sm transition hover:bg-white/12"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/30 border border-blue-400/20">
                        <Icon className="h-3.5 w-3.5 text-blue-200" strokeWidth={1.75} />
                      </div>
                      <p className="text-xs font-semibold text-white leading-tight">{label}</p>
                      <p className="text-[10px] text-blue-200/70 leading-snug">{desc}</p>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <p className="text-[11px] text-blue-200/50 tracking-wide">
                  Developed by EYO SOLUTIONS
                </p>
              </div>
            </div>

            {/* ── Right — form panel ───────────────────────────────────── */}
            <div className="flex items-center px-6 py-8 sm:px-9 sm:py-10 lg:px-10 lg:py-12">
              <div className="mx-auto w-full max-w-sm">

                {/* Heading */}
                <div className="mb-7 text-center lg:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-blue-600/80">
                    Welcome Back
                  </p>
                  <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                    Sign in
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter your credentials to access your account
                  </p>
                </div>

                {/* Idle session notice */}
                {notice && (
                  <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/90 px-4 py-3">
                    <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                    <p className="text-sm text-blue-700">{notice}</p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                      >
                        {showPw ? "Hide" : "Show"} password
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        tabIndex={-1}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition hover:text-slate-600"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1d4ed8_0%,#1e40af_48%,#0f172a_100%)] text-sm font-semibold text-white shadow-[0_20px_36px_-20px_rgba(29,78,216,0.85)] transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {loading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Enter Dashboard
                      </>
                    )}
                  </button>
                </form>

                {/* Divider + agent link */}
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">or</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <a
                  href="/agent/login"
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white/80 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Users className="h-4 w-4" />
                  Sign in as a Sales Agent
                </a>

                {/* Protected notice */}
                <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-center text-xs leading-5 text-slate-500 lg:text-left">
                  Protected workspace — authorised staff only. Contact your administrator for access.
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs font-medium tracking-[0.14em] text-slate-500">
          PETROS BUSINESS SUITE · EYO SOLUTIONS
        </p>
      </main>
    </div>
  );
}
