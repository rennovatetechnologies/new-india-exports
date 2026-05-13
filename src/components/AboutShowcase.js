"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AboutShowcase() {
  const slides = [
    "/f1.jpg",
    "/f2.jpg",
    "/f3.jpg",
    "/f4.jpg",
    "/f5.jpg",
    "/f6.jpg",
    "/f7.jpg",
    "/f8.jpg",
  ];

  const [index, setIndex] = useState(0);

  // Autoplay
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const nextSlide = () => setIndex((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setIndex((prev) => (prev - 1 + slides.length) % slides.length);

  return (
    <section className="relative w-full min-h-screen overflow-hidden flex items-center justify-center py-8 md:py-0">
      {/* Background */}
      <Image
        src="/f.jpg"
        alt="Background"
        fill
        priority
        className="object-cover brightness-90"
      />
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between w-[90%] max-w-6xl gap-6 md:gap-10">
        {/* LEFT: Slider - Mobile Optimized */}
        <motion.div
          initial={{ x: -50, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden w-full md:w-1/2 h-[50vh] sm:h-[55vh] md:h-[75vh] flex items-center justify-center border border-white/20"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={slides[index]}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Image
                src={slides[index]}
                alt={`Slide ${index}`}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 90vw, 50vw"
              />
            </motion.div>
          </AnimatePresence>

          {/* Arrows - Mobile Optimized */}
          <button
            onClick={prevSlide}
            className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 md:p-2 z-10 transition active:scale-95"
          >
            <ChevronLeft size={20} className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 md:p-2 z-10 transition active:scale-95"
          >
            <ChevronRight size={20} className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          {/* Dots - Mobile Optimized */}
          <div className="absolute bottom-3 md:bottom-5 left-0 right-0 flex justify-center gap-1.5 md:gap-2 z-10">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`rounded-full transition-all ${
                  i === index 
                    ? "bg-white scale-110 w-3 h-3 md:w-2.5 md:h-2.5" 
                    : "bg-gray-400/60 w-2 h-2 md:w-2.5 md:h-2.5"
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* RIGHT: Text Box - Mobile Optimized */}
<motion.div
  initial={{ x: 50, opacity: 0 }}
  whileInView={{ x: 0, opacity: 1 }}
  transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
  className="w-full md:w-1/2 bg-white/90 rounded-2xl shadow-xl p-6 md:p-10 backdrop-blur-md border border-white/30"
>
  <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-800 mb-4 tracking-tight">
    The Visionary Behind New India Export
  </h2>

  <p className="text-gray-700 text-base sm:text-lg md:text-xl leading-relaxed mb-4">
    <span className="font-semibold text-gray-800">Mr. Saurabh Nathuram Yadav</span> is the driving force behind New India Export.  
    With a bold vision to empower Indian farmers and elevate the global agricultural trade, he combines deep expertise, innovation, and a strong commitment to fairness.  
  </p>

  <p className="text-gray-700 text-base sm:text-lg md:text-xl leading-relaxed mb-4">
    Under his leadership, the company bridges local talent with international markets, ensuring farmers thrive while delivering unparalleled quality worldwide.  
    His passion and ambition are transforming the landscape of Indian exports.
  </p>

  <p className="italic text-gray-800 text-base sm:text-lg md:text-xl">
    "Empowering farmers, delivering excellence, and redefining Indian exports globally."
  </p>
</motion.div>

      </div>
    </section>
  );
}