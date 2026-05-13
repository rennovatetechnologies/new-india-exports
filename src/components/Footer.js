"use client";
import { useEffect, useState } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function Footer() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <>
      <footer className="w-full bg-[#16a34a] text-white py-12 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Company Info */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold">New India Export</h2>
            <p className="text-sm">
              Shop No M02, Premium Plaza Commercial Complex, Dharampeth, Nagpur 440010
            </p>
            <p className="text-sm">Phone: 90288 94149</p>
            <p className="text-sm">Email: Newindexport@gmail.com</p>
          </div>

          {/* Quick Links */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Quick Links</h2>
            <ul className="space-y-1 text-sm">
              <li><Link href="/" className="hover:underline">Home</Link></li>
              <li><Link href="/about" className="hover:underline">About Us</Link></li>
              <li><Link href="/brochures" className="hover:underline">Brochures</Link></li>
              <li><Link href="/gallery" className="hover:underline">Gallery</Link></li>
              <li><Link href="/contact" className="hover:underline">Contact</Link></li>
            </ul>
          </div>

          {/* Social / Extra */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Connect with Us</h2>
            <p className="text-sm">Follow us on social media for updates!</p>
            <div className="flex space-x-4 mt-2">
              <a href="https://wa.me/919028894149" target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-700 p-2 rounded-full transition">
                <MessageCircle size={24} />
              </a>
              {/* You can add more social icons here */}
            </div>
          </div>
        </div>

        <div className="text-center mt-10 text-sm opacity-90" suppressHydrationWarning>
          © {new Date().getFullYear()} New India Export. All rights reserved.
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/919028894149"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 right-6 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center"
      >
        <MessageCircle size={28} />
      </a>

      {/* Back to Top Button with animation */}
      <AnimatePresence>
        {showTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg flex items-center justify-center"
            whileHover={{ scale: 1.2 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <ArrowUp size={24} className="animate-bounce" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
