"use client";
import { motion } from "framer-motion";
import { Globe2, Layers, Sparkles, ShieldCheck, Users2, Zap } from "lucide-react";

export default function WhyChooseUs() {
  return (
    <section className="relative py-24 sm:py-28 overflow-hidden">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
            <Sparkles size={12} className="text-[var(--gold)]" /> Why VISTARA
          </span>
          <h2 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight">
            Built like a fintech. <span className="text-gold-gradient">Run like a global desk.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3 md:grid-rows-2 md:auto-rows-fr">
          {/* Big feature */}
          <motion.div
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="md:col-span-2 md:row-span-2 glass-card p-8 relative overflow-hidden"
          >
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--gold)]/15 blur-3xl" />
            <Globe2 size={28} className="text-[var(--gold)]" />
            <h3 className="mt-5 text-2xl font-semibold">Global trade, single timeline.</h3>
            <p className="mt-3 max-w-md text-white/60">
              DGFT, ICEGATE, AD code, RCMC, phytosanitary, banking — every gate
              tracked in one workflow with operations support attached.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4">
              <BentoStat n="30+" l="Countries" />
              <BentoStat n="1.2k" l="Exporters" />
              <BentoStat n="22 days" l="Avg onboarding" />
            </div>
          </motion.div>

          <BentoCard Icon={Layers} title="Modular plans" body="Basic to Premium with white-glove ops." />
          <BentoCard Icon={ShieldCheck} title="Compliance-grade" body="Built around DGFT and ICEGATE flows." />
          <BentoCard Icon={Zap} title="Fast operations" body="Median KYC review under 24 hours." />
          <BentoCard Icon={Users2} title="Real humans" body="Dedicated success manager on Premium." />
        </div>
      </div>
    </section>
  );
}

function BentoCard({ Icon, title, body }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      whileHover={{ y: -4 }}
      className="glass-card p-6"
    >
      <Icon size={20} className="text-[var(--gold)]" />
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-white/55">{body}</p>
    </motion.div>
  );
}

function BentoStat({ n, l }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-xl font-semibold text-white">{n}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/45">{l}</div>
    </div>
  );
}
