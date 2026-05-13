"use client";
import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function OrganicFoodsPage() {
  const categories = [
    { name: "VEGETABLES", img: "/veg1.jpg", link: "/fruitsandvegetables" },
    { name: "FRUITS", img: "/veg.jpg", link: "/fruitsandvegetables" },
    { name: "SPICES", img: "/Spices.jpg", link: "/spices" },
  ];

  const [selectedImg, setSelectedImg] = useState(null);

  return (
    <main className="flex flex-col min-h-screen bg-[#fdf3e6] text-[#2e2e2e]">
      {/* ==== HEADER ==== */}
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="Organic Foods Header"
          fill
          priority
          quality={80}
          className="object-cover brightness-75 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/30 to-transparent" />
        <div className="relative z-10 text-white px-6 mt-16 sm:mt-20">
          <div className="inline-block mb-6">
            <div className="w-20 h-1 bg-[#16a34a] mx-auto mb-4"></div>
            <h1 className="text-5xl sm:text-7xl font-bold mb-4 tracking-tight text-white">
              Organic Foods
            </h1>
            <div className="w-20 h-1 bg-[#16a34a] mx-auto"></div>
          </div>
          <p className="max-w-2xl mx-auto text-white text-lg sm:text-xl font-light tracking-wide">
            Fresh and natural products sourced directly from farms
          </p>
        </div>
      </section>

      {/* ==== CATEGORIES ==== */}
      <section className="py-14 px-4 sm:px-8 max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl font-bold mb-12 text-center text-[#2f5233]"
        >
          Explore Our Organic Categories
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative bg-white rounded-2xl shadow-md hover:shadow-xl overflow-hidden cursor-pointer"
            >
              {/* Image */}
              <div
                className="relative w-full h-64 sm:h-72"
                onClick={() => setSelectedImg(cat.img)}
              >
                <Image
                  src={cat.img}
                  alt={cat.name}
                  fill
                  className="object-cover"
                />
              </div>

              {/* Text + Button */}
              <div className="p-4 sm:p-6 text-center">
                <h3 className="text-2xl font-semibold text-[#2f5233] mb-2">{cat.name}</h3>
                <Link
                  href={cat.link}
                  className="inline-block px-6 py-2 mt-2 rounded-full bg-[#16a34a] text-white font-semibold text-sm hover:bg-green-700 transition"
                >
                  Click Here
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==== MODAL FOR FULL IMAGE ==== */}
      <AnimatePresence>
        {selectedImg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setSelectedImg(null)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative w-[90%] max-w-4xl h-[80%]"
            >
              <Image
                src={selectedImg}
                alt="Full Organic Food"
                fill
                className="object-contain"
              />
              <button
                className="absolute top-4 right-4 text-white text-3xl font-bold"
                onClick={() => setSelectedImg(null)}
              >
                ×
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
