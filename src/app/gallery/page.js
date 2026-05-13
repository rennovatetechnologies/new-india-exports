"use client";
import Image from "next/image";
import { motion } from "framer-motion";

export default function GalleryPage() {
  const galleryImages = [
    "/f1.jpg",
    "/gallery/DelhiIITF.jpg",
    "/gallery/dgft.jpg",
    "/gallery/FarmVisit.jpg",
    "/gallery/GulfFood.jpg",
    "/gallery/ICARYavatmal.jpg",
    "/gallery/ICDMihan.jpg",
    "/gallery/MCED.jpg",
    "/gallery/ODOP.jpg",
    "/gallery/PuneAwards.jpg",
    "/gallery/SaudiArabia.jpg",
    "/gallery/Spain.jpg",
    "/gallery/WTC2023.jpg",
    "/f2.jpg",
    "/f3.jpg",
    "/f4.jpg",
    "/f5.jpg",
    "/f6.jpg",
    "/f7.jpg",
    "/f8.jpg",
    "/f9.jpg",
    "/f10.jpg",
    "/f11.jpg",
    "/f12.jpg",
    "/f.jpg",
  ];

  return (
    <main className="flex flex-col min-h-screen bg-[#fdf3e6]">
      {/* ==== HEADER SECTION ==== */}
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="Gallery Header"
          fill
          priority
          quality={100}
          className="object-cover brightness-75 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/30 to-transparent" />

        <div className="relative z-10 text-white px-4 mt-16 sm:mt-20">
          <div className="inline-block mb-4">
            <div className="w-20 h-1 bg-[#16a34a] mx-auto mb-3"></div>
            <h1 className="text-4xl sm:text-6xl font-bold mb-3 tracking-tight text-[#ffffff]">
              Gallery
            </h1>
            <div className="w-20 h-1 bg-[#16a34a] mx-auto"></div>
          </div>
          <p className="max-w-2xl mx-auto text-white text-base sm:text-lg font-light tracking-wide">
            A glimpse into our vibrant collection and visual highlights
          </p>
        </div>
      </section>

      {/* ==== MASONRY GALLERY ==== */}
      <section className="w-full py-12 px-2 sm:px-8 bg-[#fdf3e6]">
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-2 sm:gap-4 space-y-2 sm:space-y-4 max-w-6xl mx-auto">
          {galleryImages.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer"
            >
              <Image
                src={img}
                alt={`Gallery Image ${i + 1}`}
                width={900}
                height={900}
                quality={100}
                className="w-full h-auto rounded-xl object-cover hover:scale-105 transition-transform duration-300"
              />
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}
