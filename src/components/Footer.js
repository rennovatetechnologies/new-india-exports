"use client";
import { useEffect, useState } from "react";
import { ArrowUp, MessageCircle, Mail, Phone, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function Footer() {
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <footer className="relative mt-12 overflow-hidden border-t border-white/10 bg-[var(--background-elev)]">
        <div className="absolute inset-x-0 top-0 divider-glow" />
        <div className="absolute inset-0 -z-10 bg-mesh opacity-40" />

        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 py-16">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Link href="/" className="inline-flex items-center gap-2">
                <span className="text-2xl font-semibold tracking-tight">
                  VISTARA <span className="text-white/40">· New India Export</span>
                </span>
              </Link>
              <p className="mt-4 max-w-md text-sm text-white/55 leading-relaxed">
                Export products from anywhere to everywhere. The premium consultancy
                & workflow platform for modern global trade.
              </p>

              <div className="mt-6 space-y-2 text-sm text-white/65">
                <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 text-[var(--gold)]" /> Shop No M02, Premium Plaza Commercial Complex, Dharampeth, Nagpur 440010</div>
                <div className="flex items-center gap-2"><Phone size={15} className="text-[var(--gold)]" /> 90288 94149</div>
                <div className="flex items-center gap-2"><Mail size={15} className="text-[var(--gold)]" /> Newindexport@gmail.com</div>
              </div>
            </div>

            <FooterCol title="Platform" links={[
              ["Plans", "/#plans"],
              ["Workflow", "/#workflow"],
              ["Events", "/events"],
              ["Brochures", "/brochures"],
            ]} />
            <FooterCol title="Company" links={[
              ["About", "/about"],
              ["Gallery", "/gallery"],
              ["Contact", "/contact"],
            ]} />
            <FooterCol title="Products" links={[
              ["Spices", "/spices"],
              ["Cereals & Pulses", "/cerealsandpulses"],
              ["Organic", "/organicfood"],
              ["Fruits & Veg", "/fruitsandvegetables"],
            ]} />
          </div>

          <div className="mt-14 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/5 pt-6 text-xs text-white/40">
            <div suppressHydrationWarning>© {new Date().getFullYear()} New India Export. All rights reserved.</div>
            <div className="flex items-center gap-3">
              <a
                href="https://wa.me/919028894149"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 hover:text-white"
              >
                <MessageCircle size={14} className="text-emerald-300" /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <a
        href="https://wa.me/919028894149"
        target="_blank" rel="noopener noreferrer"
        aria-label="WhatsApp"
        className="fixed bottom-24 right-6 z-40 rounded-full border border-emerald-400/30 bg-emerald-500/90 p-3.5 text-black shadow-[0_10px_30px_-10px_rgba(52,211,153,0.6)] hover:bg-emerald-400 transition"
      >
        <MessageCircle size={22} />
      </a>

      <AnimatePresence>
        {showTop && (
          <motion.button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            aria-label="Back to top"
            className="fixed bottom-6 right-6 z-40 rounded-full glass-strong p-3.5 text-white hover:bg-white/10"
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

function FooterCol({ title, links }) {
  return (
    <div className="lg:col-span-2">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-white/55">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="hover:text-white transition">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
