"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import BookingModal from "./BookingModal";
import EventBookingModal from "./EventBookingModal";
import {
  ArrowRight,
  ShieldCheck,
  Globe2,
  Sparkles,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

export default function Hero() {
  const [open, setOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  return (
    <>
      <section className="relative isolate min-h-[100svh] overflow-hidden pt-28 pb-20 md:pt-32 md:pb-28">
        {/* Background image (very subtle) */}
        <Image
          src="/Hero.jpg"
          alt=""
          fill
          priority
          className="object-cover opacity-[0.18]"
        />
        {/* Mesh + grid + vignette */}
        <div className="absolute inset-0 -z-10 bg-mesh" />
        <div className="absolute inset-0 -z-10 grid-bg" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--background)]/40 via-[var(--background)]/70 to-[var(--background)]" />

        {/* Floating glow orbs */}
        <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-[var(--gold)]/15 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-24 h-[380px] w-[380px] rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            {/* Left: headline */}
            <div className="lg:col-span-7">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs uppercase tracking-[0.18em] text-white/80"
              >
                <Sparkles size={14} className="text-[var(--gold)]" />
                <span>VISTARA · Global Trade OS</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.05 }}
                className="mt-6 text-[44px] leading-[1.05] tracking-tight font-semibold sm:text-6xl lg:text-7xl"
              >
                Export products from
                <br />
                <span className="text-aurora">anywhere to everywhere.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15 }}
                className="mt-6 max-w-xl text-base sm:text-lg text-white/65 leading-relaxed"
              >
                The premium consultancy & workflow platform for modern exporters.
                Buy a plan, complete KYC, and ship globally — DGFT, ICEGATE, AD code
                and compliance handled in one elegant flow.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.25 }}
                className="mt-8 flex flex-col sm:flex-row gap-3"
              >
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="btn-gold group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold"
                >
                  Start Your Export Journey
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </button>
                <Link
                  href="#plans"
                  className="btn-ghost inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium"
                >
                  Explore Plans
                </Link>
              </motion.div>

              {/* Trust strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-white/55"
              >
                <span className="inline-flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--gold)]" /> DGFT · ICEGATE compliant</span>
                <span className="inline-flex items-center gap-2"><Globe2 size={14} className="text-emerald-300" /> 30+ countries served</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 size={14} className="text-cyan-300" /> 1,200+ exporters onboarded</span>
              </motion.div>
            </div>

            {/* Right: hero card */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="lg:col-span-5"
            >
              <div className="relative animate-float-y">
                <div className="absolute -inset-px rounded-[28px] bg-gradient-to-br from-[var(--gold)]/40 via-white/10 to-emerald-400/20 opacity-60 blur-xl" />
                <div className="glass-card relative p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 text-xs text-white/60">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                      Workflow live
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-white/45">Case · NIE-2841</span>
                  </div>

                  <h3 className="mt-5 text-xl font-semibold">Spices · 2 × 20ft FCL</h3>
                  <p className="text-sm text-white/55">Nagpur → Rotterdam · ETA 18 days</p>

                  {/* Stepper */}
                  <ol className="mt-6 space-y-3">
                    {[
                      { label: "Plan purchased", done: true },
                      { label: "KYC verified", done: true },
                      { label: "DGFT · IEC issued", done: true },
                      { label: "ICEGATE registration", current: true },
                      { label: "Shipment ready", done: false },
                    ].map((s, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                            s.done
                              ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-300"
                              : s.current
                              ? "bg-[var(--gold)]/15 border-[var(--gold)]/50 text-[var(--gold)] shadow-[0_0_18px_rgba(244,196,106,0.45)]"
                              : "bg-white/5 border-white/10 text-white/40"
                          }`}
                        >
                          {s.done ? "✓" : i + 1}
                        </span>
                        <span className={`text-sm ${s.done ? "text-white/85" : s.current ? "text-white" : "text-white/40"}`}>
                          {s.label}
                        </span>
                        {s.current && (
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--gold)]">In progress</span>
                        )}
                      </li>
                    ))}
                  </ol>

                  {/* Progress bar */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-xs text-white/55">
                      <span>Onboarding progress</span>
                      <span className="text-white/85">68%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="relative h-full w-[68%] rounded-full bg-gradient-to-r from-[var(--gold)] to-emerald-300">
                        <div className="absolute inset-0 shimmer" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <Stat label="Days saved" value="14" />
                    <Stat label="Docs verified" value="22" />
                    <Stat label="Status" value="On track" tone="emerald" />
                  </div>

                  <button
                    onClick={() => setEventOpen(true)}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.06] transition"
                  >
                    <TrendingUp size={14} className="text-[var(--gold)]" />
                    Reserve seat · Virtual Shipment Workshop
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <BookingModal open={open} setOpen={setOpen} />
      <EventBookingModal open={eventOpen} setOpen={setEventOpen} />
    </>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={`mt-1 text-base font-semibold ${tone === "emerald" ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  );
}
