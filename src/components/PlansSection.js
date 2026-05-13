"use client";
import { motion } from "framer-motion";
import { Check, Minus, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Basic",
    tag: "Get listed",
    price: "₹33,999",
    gst: "+ GST",
    timeline: "Liaisoning · 22 days",
    accent: "from-white/30 to-white/5",
    glow: "rgba(255,255,255,0.12)",
    featured: false,
    features: [
      ["Gumasta / Shop Act Registration", true],
      ["MSME Registration", true],
      ["IEC (Import Export Code)", true],
      ["Bank Account Assistance", true],
      ["GST Registration & LUT Filing", true],
      ["AD Code Generation", true],
      ["RCMC Certificate", true],
      ["Phytosanitary / Fumigation", true],
      ["DSC (Class 3)", true],
      ["DGFT Registration", false],
      ["ICEGATE Integration", false],
      ["Company Formation", false],
    ],
  },
  {
    name: "Standard",
    tag: "Most popular",
    price: "₹43,999",
    gst: "+ GST",
    timeline: "Liaisoning · 22 days",
    accent: "from-cyan-300/40 to-emerald-300/10",
    glow: "rgba(103,232,249,0.18)",
    featured: false,
    features: [
      ["Everything in Basic", true],
      ["DGFT Registration & Integration", true],
      ["ICEGATE Registration & Integration", true],
      ["AD Code Approval", true],
      ["IFSC / PFMS Approval", true],
      ["Company Formation", false],
      ["Trademark Application", false],
      ["Quality Assessment Support", false],
      ["Pre & Post Shipment Docs", false],
      ["Shipment Cost Analysis", false],
      ["Expert Compliance Reviews", false],
      ["Exhibition Networking", false],
    ],
  },
  {
    name: "Premium",
    tag: "Full ops, white-glove",
    price: "₹83,999",
    gst: "+ GST",
    timeline: "Liaisoning · 45 days",
    accent: "from-[var(--gold)]/60 to-amber-300/10",
    glow: "rgba(244,196,106,0.35)",
    featured: true,
    features: [
      ["Everything in Standard", true],
      ["Company Formation", true],
      ["Trademark Application", true],
      ["Digital Platform Assistance", true],
      ["Quality Assessment Certification", true],
      ["Pre & Post Shipment Documentation", true],
      ["Shipment Cost Analysis & Statement", true],
      ["Expert Reviews & Compliance", true],
      ["Exhibition Exposure & Networking", true],
      ["Dedicated success manager", true],
      ["Priority operations queue", true],
      ["Investor & buyer intros", true],
    ],
  },
];

export default function PlansSection() {
  return (
    <section id="plans" className="relative py-24 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-mesh opacity-50" />
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
            <Sparkles size={12} className="text-[var(--gold)]" /> Consultancy Plans
          </span>
          <h2 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight">
            Pick a plan. <span className="text-gold-gradient">Start exporting.</span>
          </h2>
          <p className="mt-4 text-white/60">
            Transparent pricing. Real timelines. Zero government-portal pain.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((p, idx) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
              whileHover={{ y: -6 }}
              className={`relative ${p.featured ? "lg:-mt-4" : ""}`}
            >
              {p.featured && (
                <div
                  className="absolute -inset-px rounded-[26px] opacity-80 blur-md"
                  style={{ background: `radial-gradient(60% 50% at 50% 0%, ${p.glow}, transparent 70%)` }}
                />
              )}
              <div
                className={`relative glass-card p-7 h-full flex flex-col ${
                  p.featured ? "ring-1 ring-[var(--gold)]/40" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/55">{p.tag}</span>
                  {p.featured && (
                    <span className="rounded-full bg-[var(--gold)]/15 border border-[var(--gold)]/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--gold)]">
                      Premium
                    </span>
                  )}
                </div>

                <h3 className={`mt-3 text-2xl font-semibold ${p.featured ? "text-gold-gradient" : "text-white"}`}>
                  {p.name}
                </h3>

                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                  <span className="text-sm text-white/50">{p.gst}</span>
                </div>
                <div className="text-xs text-white/50 mt-1">{p.timeline}</div>

                <div className="my-6 divider-glow" />

                <ul className="space-y-2.5 flex-1">
                  {p.features.map(([text, on]) => (
                    <li key={text} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full ${
                          on
                            ? "bg-emerald-400/15 text-emerald-300"
                            : "bg-white/5 text-white/30"
                        }`}
                      >
                        {on ? <Check size={11} /> : <Minus size={11} />}
                      </span>
                      <span className={on ? "text-white/85" : "text-white/35 line-through"}>{text}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={`mt-7 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${
                    p.featured ? "btn-gold" : "btn-ghost"
                  }`}
                >
                  {p.featured ? "Get Premium" : `Choose ${p.name}`}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-white/40">* T&C applied · Inclusive of standard government processing</p>
      </div>
    </section>
  );
}
