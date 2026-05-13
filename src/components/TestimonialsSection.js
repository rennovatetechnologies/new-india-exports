"use client";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const items = [
  {
    quote:
      "VISTARA turned a year of paperwork into a 4-week timeline. Our first FCL of turmeric shipped to Rotterdam without a single chase email.",
    name: "Aarav Mehta",
    role: "Founder · Saffron Roots Exports",
  },
  {
    quote:
      "We treated it like Stripe for export. The operations team is genuinely on your side — DGFT, ICEGATE, banking, all sorted.",
    name: "Priya Nair",
    role: "COO · Konkan Organics",
  },
  {
    quote:
      "The premium plan paid for itself on the first shipment. The compliance reviews caught two issues that would have killed our timeline.",
    name: "Rohit Sharma",
    role: "Director · Vidarbha Agritrade",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="relative py-24 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-mesh opacity-30" />
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> Testimonials
          </span>
          <h2 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight">
            Trusted by exporters <span className="text-gold-gradient">building global brands.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((t, i) => (
            <motion.figure
              key={i}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-6 flex flex-col"
            >
              <Quote size={22} className="text-[var(--gold)]" />
              <blockquote className="mt-4 text-white/75 leading-relaxed text-[15px]">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-6 pt-4 border-t border-white/10">
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-xs text-white/50">{t.role}</div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
