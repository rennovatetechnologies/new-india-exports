"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { FaLeaf, FaShippingFast, FaSeedling, FaAward } from "react-icons/fa";

export default function AboutUsSection() {
  const highlights = [
    { text: "Direct food from farm", icon: <FaLeaf size={28} className="text-[#16a34a]" /> },
    { text: "Merchant exporter", icon: <FaShippingFast size={28} className="text-[#16a34a]" /> },
    { text: "Organic food", icon: <FaSeedling size={28} className="text-[#16a34a]" /> },
    { text: "Quality service", icon: <FaAward size={28} className="text-[#16a34a]" /> },
  ];

  return (
    <section className="w-full bg-[#fdf3e6] py-20">
      <div className="max-w-7xl mx-auto px-6 text-center sm:text-left">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl font-bold text-[#2f5233] mb-6"
        >
          About New India Export
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="text-lg sm:text-xl text-[#2e2e2e] font-light max-w-3xl mb-12"
        >
          New India Export focuses on exporting products from all over the world. We prioritize
          quality, quantity, variety, accuracy, relationships, and services. Our mission is to
          spread India's products, culture, and quality worldwide.
        </motion.p>

        {/* Highlights */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-12"
        >
          {highlights.map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className="flex flex-col items-center bg-white rounded-2xl py-6 px-4 shadow-md hover:shadow-xl transition cursor-pointer"
            >
              <div className="mb-4">{item.icon}</div>
              <p className="text-center text-[#2f5233] font-semibold">{item.text}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Button */}
        <div className="text-center sm:text-left">
          <Link
            href="/about"
            className="inline-block px-8 py-3 bg-[#16a34a] hover:bg-green-700 text-white font-semibold rounded-full shadow-lg transition-all duration-300"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
