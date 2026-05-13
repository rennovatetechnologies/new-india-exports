"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";
import { X } from "lucide-react";

export default function BrochuresPage() {
  const brochureImages = [
    "/brochure/B1.jpg",
    "/brochure/B2.jpg",
    "/brochure/B3.jpg",
    "/brochure/B4.jpg",
    "/brochure/B5.jpg",
    "/brochure/B6.jpg",
    "/brochure/B8.jpg",
    "/brochure/B9.jpg",
    "/brochure/B10.jpg",
    "/brochure/B11.jpg",
    "/brochure/B12.jpg",
    "/brochure/B13.jpg",
    "/brochure/B14.jpg",
    "/brochure/B15.jpg",
    "/brochure/B16.jpg",
    "/brochure/B17.jpg",
    
  ];

  const [selectedImage, setSelectedImage] = useState(null);

  return (
    <main className="flex flex-col min-h-screen bg-[#fdf3e6]">
      {/* ==== HEADER SECTION ==== */}
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="New India Export Brochures"
          fill
          priority
          quality={100}
          className="object-cover brightness-75 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/30 to-transparent" />

        <div className="relative z-10 text-white px-6 mt-16 sm:mt-20">
          <div className="inline-block mb-6">
            <div className="w-20 h-1 bg-[#16a34a] mx-auto mb-4"></div>
            <h1 className="text-5xl sm:text-7xl font-bold mb-4 tracking-tight text-[#ffffff]">
              Brochures
            </h1>
            <div className="w-20 h-1 bg-[#16a34a] mx-auto"></div>
          </div>
          <p className="max-w-2xl mx-auto text-white text-lg sm:text-xl font-light tracking-wide">
            Explore our product catalogues and visual brochures
          </p>
        </div>
      </section>

      {/* ==== BROCHURE GRID ==== */}
      <section className="w-full py-10 px-2 sm:px-6 bg-[#fdf3e6]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-7xl mx-auto">
          {brochureImages.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="relative w-full h-[60vh] sm:h-[80vh] overflow-hidden rounded-xl shadow-md bg-white/30 backdrop-blur-sm cursor-pointer"
              onClick={() => setSelectedImage(img)}
            >
              <Image
                src={img}
                alt={`Brochure ${i + 1}`}
                fill
                quality={100}
                className="object-contain rounded-xl hover:scale-[1.02] transition-transform duration-300"
              />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==== FULLSCREEN IMAGE VIEWER (for mobile) ==== */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 bg-white/20 p-2 rounded-full hover:bg-white/40 transition"
          >
            <X className="text-white w-6 h-6" />
          </button>
          <div className="relative w-full max-w-4xl h-[80vh]">
            <Image
              src={selectedImage}
              alt="Fullscreen view"
              fill
              quality={100}
              className="object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </main>
  );
}
