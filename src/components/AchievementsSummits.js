"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AchievementsSummits() {
  const internationalSlides = [
    { image: "/gallery/Spain.jpg", title: "Spain Global Trade Summit", desc: "Representing India at Spain’s major international trade platform." },
    { image: "/gallery/SaudiArabia.jpg", title: "Saudi Arabia Exhibition", desc: "Showcasing Indian agricultural excellence in Riyadh & Jeddah expos." },
    { image: "/gallery/GUlfFood.jpg", title: "Gulf Foods Dubai", desc: "Participation in one of the world's biggest food trade exhibitions." },
    { image: "/gallery/WTC2023.jpg", title: "European Trade Delegation", desc: "Meeting global buyers, distributors, and trade officials." },
  ];

  const nationalSlides = [
    { image: "/gallery/dgft.jpg", title: "DGFT Summit", desc: "Collaboration with Directorate General of Foreign Trade officials." },
    { image: "/gallery/MumbaiWTC.jpg", title: "World Trade Centre Mumbai", desc: "Presenting Maharashtra’s agricultural potential at WTC." },
    { image: "/gallery/DelhiIITF.jpg", title: "Delhi IITF", desc: "Featuring in India International Trade Fair for export promotion." },
    { image: "/gallery/ODOP.jpg", title: "One District One Product", desc: "Representing Nagpur & Amravati oranges on national platform." },
  ];

  const [intIndex, setIntIndex] = useState(0);
  const [natIndex, setNatIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIntIndex((prev) => (prev + 1) % internationalSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNatIndex((prev) => (prev + 1) % nationalSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const moveInt = (dir) =>
    setIntIndex((prev) => (prev + dir + internationalSlides.length) % internationalSlides.length);

  const moveNat = (dir) =>
    setNatIndex((prev) => (prev + dir + nationalSlides.length) % nationalSlides.length);

  return (
    <section
      className="relative w-full min-h-screen flex flex-col items-center justify-center py-20"
    >
      {/* BACKGROUND IMAGE */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/bg.jpg"     // <-- change to whatever bg image you want
          alt="background"
          fill
          className="object-cover"
        />
        {/* Dark Blur Overlay */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
      </div>

      <h2 className="text-4xl md:text-5xl font-bold text-white mb-12 drop-shadow-xl">
        Summits & Achievements
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-[90%] max-w-6xl">

        {/* INTERNATIONAL */}
        <div>
          <div className="relative bg-black/30 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden h-[55vh] border border-white/20">
            <AnimatePresence mode="wait">
              <motion.div
                key={internationalSlides[intIndex].image}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0"
              >
                <Image
                  src={internationalSlides[intIndex].image}
                  alt="International slide"
                  fill
                  className="object-cover"
                />
              </motion.div>
            </AnimatePresence>

            {/* Buttons */}
            <button
              onClick={() => moveInt(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2"
            >
              <ChevronLeft />
            </button>
            <button
              onClick={() => moveInt(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2"
            >
              <ChevronRight />
            </button>

            <div className="absolute bottom-0 w-full bg-black/60 p-3 text-center text-white">
              <p className="font-semibold text-lg">
                {internationalSlides[intIndex].title}
              </p>
            </div>
          </div>

          {/* TEXT BELOW INTERNATIONAL */}
          <div className="mt-4 bg-black/40 backdrop-blur-lg shadow-md p-4 rounded-xl border border-white/20 text-center text-white">
            <h3 className="text-xl font-bold mb-2">
              {internationalSlides[intIndex].title}
            </h3>
            <p className="opacity-90">
              {internationalSlides[intIndex].desc}
            </p>
          </div>
        </div>

        {/* NATIONAL */}
        <div>
          <div className="relative bg-black/30 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden h-[55vh] border border-white/20">
            <AnimatePresence mode="wait">
              <motion.div
                key={nationalSlides[natIndex].image}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0"
              >
                <Image
                  src={nationalSlides[natIndex].image}
                  alt="National slide"
                  fill
                  className="object-cover"
                />
              </motion.div>
            </AnimatePresence>

            {/* Buttons */}
            <button
              onClick={() => moveNat(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2"
            >
              <ChevronLeft />
            </button>
            <button
              onClick={() => moveNat(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2"
            >
              <ChevronRight />
            </button>

            <div className="absolute bottom-0 w-full bg-black/60 p-3 text-center text-white">
              <p className="font-semibold text-lg">
                {nationalSlides[natIndex].title}
              </p>
            </div>
          </div>

          {/* TEXT BELOW NATIONAL */}
          <div className="mt-4 bg-black/40 backdrop-blur-lg shadow-md p-4 rounded-xl border border-white/20 text-center text-white">
            <h3 className="text-xl font-bold mb-2">
              {nationalSlides[natIndex].title}
            </h3>
            <p className="opacity-90">
              {nationalSlides[natIndex].desc}
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
