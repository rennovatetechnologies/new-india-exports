"use client";
import Image from "next/image";
import { motion } from "framer-motion";

export default function CerealsAndPulsesPage() {
  const basmatiRice = [
    ["1509 WHITE SELLA BASMATI RICE", "8.3+ mm"],
    ["1509 GOLDEN SELLA BASMATI RICE", "8.35+ mm"],
    ["1509 STEAM BASMATI RICE", "8.35+ mm"],
    ["1121 WHITE SELLA BASMATI RICE", "8.35+ mm"],
    ["1121 GOLDEN SELLA BASMATI RICE", "8.35+ mm"],
    ["1121 STEAM RICE", "8.35+ mm"],
    ["SUGANDHA WHITE SELLA RICE", "7.85+ mm"],
    ["SUGANDHA GOLDEN SELLA RICE", "7.85+ mm"],
    ["SUGANDHA STEAM RICE", "7.85+ mm"],
    ["PR 11 WHITE SELLA RICE", "6.80+ mm"],
    ["PR 11 STEAM RICE", "6.80+ mm"],
    ["IR 64 (5% BROKEN RICE)", "6+ mm"],
  ];

  const nonBasmati = [
    "JAI SHREE RAM RICE",
    "AROMATIC CHINNOR RICE",
    "MASOORI RICE",
    "AROMATIC AMBIA MOHAR",
    "AROMATIC PARVATI SUT RICE",
  ];

  // Assign **actual image paths** for each cereal/pulse
  const otherItems = [
    { name: "SORGHUM (JOWAR)", img: "/cereals/jowar.jpg" },
    { name: "WHEAT", img: "/cereals/wheat.jpg" },
    { name: "MAIZE", img: "/cereals/maize.jpg" },
    { name: "SOYABEAN", img: "/cereals/soyabean.jpg" },
    { name: "PEAR MILLET", img: "/cereals/pear.jpg" },
    { name: "RED GRAM", img: "/cereals/redgram.jpg" },
    { name: "BLACK GRAM", img: "/cereals/blackgram.jpg" },
    { name: "GREEN GRAM", img: "/cereals/greengram.jpg" },
  ];

  return (
    <main className="flex flex-col min-h-screen bg-[#fdf3e6] text-[#2e2e2e]">
      {/* ==== HEADER ==== */}
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="Cereals and Pulses Header"
          fill
          priority
          quality={80}
          className="object-cover brightness-75 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/30 to-transparent" />
        <div className="relative z-10 text-white px-6 mt-16 sm:mt-20">
          <div className="inline-block mb-6">
            <div className="w-20 h-1 bg-[#16a34a] mx-auto mb-4"></div>
            <h1 className="text-5xl sm:text-7xl font-bold mb-4 tracking-tight text-[#ffffff]">
              Cereals & Pulses
            </h1>
            <div className="w-20 h-1 bg-[#16a34a] mx-auto"></div>
          </div>
          <p className="max-w-2xl mx-auto text-white text-lg sm:text-xl font-light tracking-wide">
            Explore our premium grains and pulses sourced directly from farmers
          </p>
        </div>
      </section>

      {/* ==== BASMATI RICE ==== */}
      <section className="py-14 px-4 sm:px-8 max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl font-bold mb-8 text-center text-[#2f5233]"
        >
          Basmati Rice Varieties
        </motion.h2>

        <div className="relative w-full h-[50vh] sm:h-[60vh] mb-10 rounded-lg overflow-hidden shadow-md">
          <Image
            src="/cereals/basmati.jpg"
            alt="Basmati Rice"
            fill
            quality={80}
            className="object-cover"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-gray-300 text-base bg-white rounded-lg overflow-hidden shadow-sm">
            <thead className="bg-[#16a34a] text-white">
              <tr>
                <th className="p-3 border border-gray-300">SR. NO</th>
                <th className="p-3 border border-gray-300">COMMODITY</th>
                <th className="p-3 border border-gray-300">LENGTH</th>
              </tr>
            </thead>
            <tbody>
              {basmatiRice.map((item, i) => (
                <tr
                  key={i}
                  className="odd:bg-[#f8f6f2] even:bg-white hover:bg-[#e9f7ef] transition"
                >
                  <td className="p-3 border border-gray-300 text-center">{i + 1}</td>
                  <td className="p-3 border border-gray-300 font-medium">{item[0]}</td>
                  <td className="p-3 border border-gray-300 text-center">{item[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ==== NON BASMATI RICE ==== */}
      <section className="py-14 px-4 sm:px-8 max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl font-bold mb-8 text-center text-[#2f5233]"
        >
          Non-Basmati Rice Varieties
        </motion.h2>

        <div className="relative w-full h-[50vh] sm:h-[60vh] mb-10 rounded-lg overflow-hidden shadow-md">
          <Image
            src="/cereals/nonbasmati.jpg"
            alt="Non-Basmati Rice"
            fill
            quality={80}
            className="object-cover"
          />
        </div>

        <ul className="bg-white p-6 rounded-lg shadow-md space-y-3 text-lg leading-relaxed">
          {nonBasmati.map((item, i) => (
            <li key={i} className="flex items-center">
              <span className="text-[#16a34a] font-semibold mr-2">{i + 1}.</span> {item}
            </li>
          ))}
        </ul>
      </section>

      {/* ==== OTHER ITEMS ==== */}
      <section className="py-14 px-4 sm:px-8 max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl font-bold mb-10 text-center text-[#2f5233]"
        >
          Other Cereals and Pulses
        </motion.h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {otherItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="relative bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-4 text-center"
            >
              <div className="relative w-full h-40 mb-4 rounded-lg overflow-hidden">
                <Image
                  src={item.img}
                  alt={item.name}
                  fill
                  className="object-cover"
                />
              </div>
              <h3 className="text-lg font-semibold text-[#2f5233]">{item.name}</h3>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}
