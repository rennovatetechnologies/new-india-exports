"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Leaf, Truck, Sprout, Award, ArrowUpRight } from "lucide-react";

const highlights = [
  { text: "Direct from the farm", sub: "Farm-to-port sourcing across India", Icon: Leaf },
  { text: "Merchant exporter", sub: "End-to-end logistics & docs", Icon: Truck },
  { text: "Organic & certified", sub: "FSSAI · APEDA · Phytosanitary", Icon: Sprout },
  { text: "Quality, every shipment", sub: "QA on every container", Icon: Award },
];

export default function AboutUsSection() {
  return (
    <section className="relative py-24 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-mesh opacity-60" />
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" /> About VISTARA
            </span>
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight"
            >
              India's products. <span className="text-gold-gradient">The world's shelves.</span>
            </motion.h2>
            <p className="mt-5 text-white/65 leading-relaxed max-w-lg">
              New India Export builds the modern operating system for global trade —
              quality sourcing, compliance, documentation, and shipment, packaged into
              consultancy plans that get you exporting in weeks, not quarters.
            </p>

            <Link
              href="/about"
              className="mt-8 inline-flex items-center gap-2 btn-ghost rounded-full px-5 py-2.5 text-sm font-medium"
            >
              Our story <ArrowUpRight size={16} />
            </Link>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {highlights.map(({ text, sub, Icon }, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  className="glass-card p-5 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--gold)]/20 to-emerald-400/10 border border-white/10 text-[var(--gold)]">
                      <Icon size={20} />
                    </div>
                    <div>
                      <div className="font-medium text-white">{text}</div>
                      <div className="mt-1 text-sm text-white/55">{sub}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
