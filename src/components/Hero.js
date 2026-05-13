"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import BookingModal from "./BookingModal";
import EventBookingModal from "./EventBookingModal";
import { FaCalendarAlt, FaMapMarkerAlt, FaChevronRight, FaStar } from "react-icons/fa";
import Link from "next/link";

export default function Hero() {
  const [open, setOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);

  return (
    <>
      {/* HERO SECTION - Mobile fixed, desktop awesome */}
      <section className="relative min-h-screen pt-20 md:pt-0 flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <Image
          src="/Hero.jpg"
          alt="New India Export"
          fill
          priority
          className="object-cover"
        />

        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30" />

        {/* Animated Grid Overlay - Desktop only */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] opacity-50 hidden md:block" />

        {/* Floating Elements - Desktop only */}
        <motion.div
          className="hidden lg:block absolute top-1/4 left-10 w-1 h-24 bg-gradient-to-b from-emerald-500/50 to-transparent"
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <motion.div
          className="hidden lg:block absolute bottom-1/4 right-10 w-24 h-1 bg-gradient-to-r from-emerald-500/30 to-transparent"
          animate={{ x: [0, 20, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        />

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 md:pt-0"
        >
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center justify-between">
            {/* Left Column - Main Hero */}
            <div className="text-center lg:text-left lg:w-1/2">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 rounded-full bg-gradient-to-r from-emerald-900/30 to-emerald-950/30 border border-emerald-800/30 backdrop-blur-sm mb-4 lg:mb-6"
              >
                <FaStar className="text-emerald-400 text-xs" />
                <span className="text-xs lg:text-sm tracking-[0.15em] lg:tracking-[0.2em] uppercase text-emerald-300 font-light">
                  Global Trade Excellence
                </span>
              </motion.div>

              <h1 className="text-white text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight drop-shadow-lg">
                New India
                <span className="block mt-1 lg:mt-2 bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                  Export
                </span>
              </h1>

              <p className="text-gray-200 text-base sm:text-lg lg:text-xl mt-3 lg:mt-4 max-w-2xl mx-auto lg:mx-0">
                Exporting India's agricultural excellence to the world with precision and trust.
              </p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-6 lg:mt-8"
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setOpen(true)}
                  type="button"
                  className="px-6 py-3.5 lg:px-8 lg:py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold rounded-full shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 flex items-center gap-2 mx-auto lg:mx-0 w-full sm:w-auto justify-center"
                >
                  <span className="text-sm lg:text-base">Book Your Shipment</span>
                  <FaChevronRight className="text-xs lg:text-sm" />
                </motion.button>
              </motion.div>
            </div>

            {/* Right Column - Event Highlight */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="w-full lg:w-1/2 max-w-lg mt-6 lg:mt-0"
            >
              {/* Reduced padding for mobile: p-4 (mobile) -> p-6 (tablet) -> p-8 (desktop) */}
              <div className="p-4 sm:p-6 lg:p-8 rounded-2xl bg-gradient-to-br from-neutral-900/95 to-black/95 backdrop-blur-md border border-emerald-800/30 shadow-2xl">
                {/* Event Badge */}
                <div className="flex items-center gap-2 mb-3 lg:mb-4">
                  <div className="p-1.5 rounded-lg bg-emerald-900/30">
                    <FaCalendarAlt className="text-emerald-400 text-sm lg:text-base" />
                  </div>
                  <span className="text-sm lg:text-base font-medium text-emerald-300">Upcoming Event</span>
                </div>

                {/* Slightly smaller heading for mobile */}
                <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-serif text-white mb-3 lg:mb-4">
                  New India Export X Virtual Shipment Workshop (5 Days)
                </h2>

                {/* Reduced margin and smaller text for mobile */}
                <p className="text-neutral-300 text-xs sm:text-sm lg:text-base mb-3 lg:mb-6 leading-relaxed">
                  Master the complete export cycle in this intensive 5-day workshop designed for future-ready global trade entrepreneurs.
                </p>

                {/* Event Details - Reduced spacing for mobile */}
                <div className="space-y-2 sm:space-y-3 lg:space-y-4 mb-3 lg:mb-6">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-neutral-800/50">
                      <FaCalendarAlt className="text-emerald-400 text-xs sm:text-sm lg:text-base" />
                    </div>
                    <div>
                      <div className="font-medium text-white text-xs sm:text-sm lg:text-base">02 – 06 May 2026</div>
                      <div className="text-xs text-neutral-400">Saturday – Wednesday • 11:00 AM – 2:00 PM</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-neutral-800/50">
                      <FaMapMarkerAlt className="text-emerald-400 text-xs sm:text-sm lg:text-base" />
                    </div>
                    <div>
                      <div className="font-medium text-white text-xs sm:text-sm lg:text-base">Online Workshop</div>
                      <div className="text-xs text-neutral-400">5-Day Intensive Access</div>
                    </div>
                  </div>
                </div>
                {/* Pricing Section */}
                <div className="relative mb-6 group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                  <div className="relative flex items-center justify-between p-4 sm:p-5 rounded-xl bg-black border border-emerald-500/30 backdrop-blur-xl">
                    <div className="flex flex-col">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-2 w-fit">
                        Special Offer
                      </span>
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">₹6399</span>
                        <span className="text-lg text-neutral-500 line-through decoration-emerald-500 decoration-2">₹34999</span>
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <div className="px-3 py-1 rounded-full bg-emerald-500 text-black text-xs font-bold">
                        80% OFF
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons - Reduced padding for mobile */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link
                    href="/events"
                    className="group px-4 py-2.5 sm:px-5 sm:py-3 lg:px-6 lg:py-3 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-black font-medium text-xs sm:text-sm flex items-center justify-center gap-2 overflow-hidden transition-all hover:shadow-lg hover:shadow-emerald-500/25"
                  >
                    <span className="relative z-10">View Event Details</span>
                    <FaChevronRight className="relative z-10 text-xs transition-transform group-hover:translate-x-1" />
                  </Link>

                  <button
                    onClick={() => setEventOpen(true)}
                    className="group px-4 py-2.5 sm:px-5 sm:py-3 lg:px-6 lg:py-3 rounded-full border border-emerald-800/50 bg-emerald-900/20 text-emerald-300 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 hover:border-emerald-700/50 hover:bg-emerald-900/30 transition-all"
                  >
                    <span>Reserve Your Seat</span>
                  </button>

                  <a
                    href="/brochure/NIE X VIRTUAL SHIPMENT WORKSHOP (5 DAYS) BROCHURE.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group px-4 py-2.5 sm:px-5 sm:py-3 lg:px-6 lg:py-3 rounded-full border border-neutral-800 bg-neutral-900/40 text-neutral-400 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 hover:border-emerald-800/50 transition-all"
                  >
                    <span>Workshop Brochure</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Scroll Indicator - Desktop only */}
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute bottom-4 lg:bottom-8 left-1/2 transform -translate-x-1/2 hidden lg:block"
          >
            <div className="w-[1px] h-12 lg:h-16 bg-gradient-to-b from-emerald-500/50 via-emerald-500/20 to-transparent" />
          </motion.div>
        </motion.div>
      </section>

      {/* BOOKING MODAL */}
      <BookingModal open={open} setOpen={setOpen} />
      <EventBookingModal open={eventOpen} setOpen={setEventOpen} />
    </>
  );
}