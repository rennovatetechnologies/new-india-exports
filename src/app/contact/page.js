"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { Phone, Mail, MapPin, Send } from "lucide-react";
import { useState } from "react";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const { name, email, message } = formData;
    const whatsappMessage = `Hello, my name is ${name}.\nEmail: ${email}\n\nMessage:\n${message}`;
    const encodedMessage = encodeURIComponent(whatsappMessage);
    window.open(`https://wa.me/919028894149?text=${encodedMessage}`, "_blank");
  };

  return (
    <main className="flex flex-col min-h-screen bg-[#fdf3e6] text-gray-800">
      {/* ==== HEADER SECTION ==== */}
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="Contact Header"
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
              Contact Us
            </h1>
            <div className="w-20 h-1 bg-[#16a34a] mx-auto"></div>
          </div>
          <p className="max-w-2xl mx-auto text-white text-base sm:text-lg font-light tracking-wide">
            We’d love to hear from you — let’s connect
          </p>
        </div>
      </section>

      {/* ==== CONTACT SECTION ==== */}
      <section className="py-16 px-6 bg-[#fdf3e6]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          {/* LEFT SIDE - Info */}
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="bg-white rounded-2xl shadow-lg p-8 space-y-6"
          >
            <h2 className="text-3xl font-semibold text-gray-800 mb-6 border-b border-gray-200 pb-3">
              Reach Us
            </h2>
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <MapPin className="text-[#16a34a] w-6 h-6 mt-1" />
                <p className="text-lg">
                  <span className="font-semibold">Office:</span> SHOP NO M02,
                  Premium Plaza Commercial Complex, Dharampeth, Nagpur – 440010
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Mail className="text-[#16a34a] w-6 h-6" />
                <p className="text-lg select-none">
                  <span className="font-semibold">Email:</span>{" "}
                  Newindexport@gmail.com
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Phone className="text-[#16a34a] w-6 h-6" />
                <p className="text-lg">
                  <span className="font-semibold">Phone:</span>{" "}
                  <span className="text-[#16a34a] font-medium">
                    +91 90288 94149
                  </span>
                </p>
              </div>
            </div>
          </motion.div>

          {/* RIGHT SIDE - Form */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ x: 50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            className="bg-white rounded-2xl shadow-lg p-8 flex flex-col space-y-5"
          >
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
              Send Us a Message
            </h2>

            <input
              type="text"
              required
              placeholder="Your Name"
              className="border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#16a34a] outline-none"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />

            <input
              type="email"
              required
              placeholder="Your Email"
              className="border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#16a34a] outline-none"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />

            <textarea
              required
              placeholder="Your Message"
              rows="5"
              className="border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#16a34a] outline-none"
              value={formData.message}
              onChange={(e) =>
                setFormData({ ...formData, message: e.target.value })
              }
            />

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              className="bg-[#16a34a] text-white py-3 rounded-lg font-semibold text-lg hover:bg-[#128a3f] transition flex items-center justify-center gap-2"
            >
              <Send size={18} /> Send Message
            </motion.button>
          </motion.form>
        </div>

        {/* ==== MAP SECTION ==== */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
          className="max-w-6xl mx-auto mt-14 rounded-2xl overflow-hidden shadow-lg border border-gray-200"
        >
          <iframe
            src="https://www.google.com/maps?q=Premium+Plaza+Commercial+Complex+Dharampeth+Nagpur+440010&output=embed"
            width="100%"
            height="450"
            allowFullScreen=""
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full border-0"
          ></iframe>
        </motion.div>
      </section>
    </main>
  );
}
