"use client";
import { motion } from "framer-motion";
import {
  CreditCard,
  FileCheck2,
  ShieldCheck,
  Building2,
  Network,
  Ship,
} from "lucide-react";

const steps = [
  { label: "Plan Purchase", desc: "Pick a plan & onboard", Icon: CreditCard },
  { label: "KYC Upload", desc: "Smart wizard, OCR-ready", Icon: FileCheck2 },
  { label: "Verification", desc: "Operations team reviews", Icon: ShieldCheck },
  { label: "DGFT", desc: "IEC issuance", Icon: Building2 },
  { label: "ICEGATE", desc: "Customs integration", Icon: Network },
  { label: "Shipment Ready", desc: "Export with confidence", Icon: Ship },
];

export default function WorkflowSection() {
  return (
    <section id="workflow" className="relative py-24 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-mesh opacity-40" />
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Workflow
          </span>
          <h2 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight">
            Six steps from <span className="text-gold-gradient">idea to shipment.</span>
          </h2>
          <p className="mt-4 text-white/60">
            We orchestrate every government portal, document and compliance gate behind a single timeline.
          </p>
        </div>

        <div className="relative mt-16">
          {/* Connector */}
          <div className="hidden md:block absolute left-0 right-0 top-[42px] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="hidden md:block absolute left-0 right-0 top-[42px] h-px shimmer" />

          <ol className="grid grid-cols-2 md:grid-cols-6 gap-5">
            {steps.map(({ label, desc, Icon }, i) => (
              <motion.li
                key={label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="relative"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="absolute -inset-2 rounded-full bg-[var(--gold)]/15 blur-md" />
                    <div className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full glass-strong">
                      <Icon size={28} className="text-[var(--gold)]" />
                    </div>
                    <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--gold)] text-[10px] font-bold text-[#1a1206]">
                      {i + 1}
                    </div>
                  </div>
                  <h4 className="mt-5 text-sm font-semibold text-white">{label}</h4>
                  <p className="mt-1 text-xs text-white/50 leading-relaxed">{desc}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
