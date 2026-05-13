"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download } from "lucide-react";

export default function Navbar() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopProductsOpen, setDesktopProductsOpen] = useState(false);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const [desktopBrochuresOpen, setDesktopBrochuresOpen] = useState(false);
  const [mobileBrochuresOpen, setMobileBrochuresOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.classList.add("drawer-open");
    } else {
      document.body.style.overflow = "";
      document.documentElement.classList.remove("drawer-open");
    }
  }, [mobileOpen]);

  useEffect(() => {
    const onResize = () => window.innerWidth >= 768 && setMobileOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setMobileProductsOpen(false);
        setMobileBrochuresOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMobileProductsOpen(false);
    setMobileBrochuresOpen(false);
    setDesktopProductsOpen(false);
    setDesktopBrochuresOpen(false);
  }, [pathname]);

  const brochures = [
    {
      name: "Workshop Flyer",
      path: "/new india (4).pdf",
      type: "download"
    },
    {
      name: "Workshop Brochure",
      path: "/BrochureFinal.pdf",
      type: "download"
    },
    {
      name: "NIE X Virtual Workshop Brochure",
      path: "/brochure/NIE X VIRTUAL SHIPMENT WORKSHOP (5 DAYS) BROCHURE.pdf",
      type: "download"
    }
  ];

  const navItems = [
    { name: "Home", path: "/" },
    {
      name: "Brochures",
      sub: brochures
    },
    {
      name: "Products",
      sub: [
        { name: "Spices", path: "/spices" },
        { name: "Cereals & Pulses", path: "/cerealsandpulses" },
        { name: "Organic Food", path: "/organicfood" },
        { name: "Fruits & Vegetables", path: "/fruitsandvegetables" },
        { name: "Others", path: "/others" },
      ],
    },
    { name: "Gallery", path: "/gallery" },
    { name: "Events", path: "/events" },
    { name: "Contact Us", path: "/contact" },
    { name: "About Us", path: "/about" },
  ];

  const isActive = (path) => (path === "/" ? pathname === "/" : pathname.startsWith(path));

  const handleBrochureClick = (item) => {
    if (item.type === "download") {
      window.open(item.path, "_blank", "noopener,noreferrer");
    }
    setMobileOpen(false);
    setDesktopBrochuresOpen(false);
  };

  const BrochureItem = ({ item, isMobile = false }) => {
    if (item.type === "download") {
      return (
        <button
          onClick={() => handleBrochureClick(item)}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${isMobile
            ? "text-zinc-300 hover:bg-white/5 hover:text-white"
            : "text-zinc-300 hover:bg-white/5 hover:text-white"
            }`}
        >
          <span>{item.name}</span>
          <Download size={14} className="text-zinc-400" />
        </button>
      );
    }

    return (
      <Link
        href={item.path}
        onClick={() => {
          setMobileOpen(false);
          setDesktopBrochuresOpen(false);
        }}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${isMobile
          ? "text-zinc-300 hover:bg-white/5 hover:text-white"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
          } ${isActive(item.path) ? "bg-white/5 text-white" : ""}`}
      >
        <span>{item.name}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Navbar */}
      <nav
        role="navigation"
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${scrolled || mobileOpen
          ? "bg-zinc-950/95 border-b border-white/10"
          : "bg-gradient-to-b from-zinc-950/80 to-transparent"
          }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md"
              aria-label="New India Export Home"
            >
              <span className="text-xl md:text-2xl font-semibold tracking-tight text-white">
                New India <span className="text-white/60">Export</span>
              </span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-7">
              {navItems.map((item) =>
                item.sub ? (
                  <div
                    key={item.name}
                    className="relative group"
                    onMouseEnter={() => {
                      if (item.name === "Products") setDesktopProductsOpen(true);
                      if (item.name === "Brochures") setDesktopBrochuresOpen(true);
                    }}
                    onMouseLeave={() => {
                      if (item.name === "Products") setDesktopProductsOpen(false);
                      if (item.name === "Brochures") setDesktopBrochuresOpen(false);
                    }}
                  >
                    <button
                      aria-haspopup="menu"
                      aria-expanded={item.name === "Products" ? desktopProductsOpen : desktopBrochuresOpen}
                      className={`flex items-center gap-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1 ${scrolled ? "text-zinc-300 hover:text-white" : "text-zinc-200 hover:text-white"
                        }`}
                    >
                      <span>{item.name}</span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-300 ${(item.name === "Products" && desktopProductsOpen) ||
                          (item.name === "Brochures" && desktopBrochuresOpen) ? "rotate-180" : ""
                          }`}
                      />
                    </button>

                    <AnimatePresence>
                      {(item.name === "Products" && desktopProductsOpen) ||
                        (item.name === "Brochures" && desktopBrochuresOpen) ? (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 12, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl"
                        >
                          {item.sub.map((sub) => (
                            item.name === "Brochures" ? (
                              <BrochureItem key={sub.name} item={sub} />
                            ) : (
                              <Link
                                key={sub.name}
                                href={sub.path}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors ${isActive(sub.path) ? "bg-white/5 text-white" : ""
                                  }`}
                              >
                                <span>{sub.name}</span>
                              </Link>
                            )
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : (
                  <Link
                    key={item.name}
                    href={item.path}
                    className={`relative group text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1 ${scrolled ? "text-zinc-300 hover:text-white" : "text-zinc-200 hover:text-white"
                      }`}
                  >
                    <span className={`${isActive(item.path) ? "text-white" : ""}`}>{item.name}</span>
                    {mounted && isActive(item.path) && (
                      <motion.span
                        className="absolute -bottom-1 left-0 h-0.5 bg-white"
                        layoutId="activeIndicator"
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </Link>
                )
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileOpen((s) => !s)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <div className="relative h-5 w-6">
                <motion.span
                  className="absolute left-0 top-0 h-[2px] w-6 rounded bg-current"
                  animate={mobileOpen ? { rotate: 45, y: 10 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.2 }}
                />
                <motion.span
                  className="absolute left-0 top-1/2 h-[2px] w-6 -translate-y-1/2 rounded bg-current"
                  animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
                <motion.span
                  className="absolute left-0 bottom-0 h-[2px] w-6 rounded bg-current"
                  animate={mobileOpen ? { rotate: -45, y: -10 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-[60] bg-black/55 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Drawer */}
            <motion.aside
              className="fixed inset-y-0 left-0 z-[70] w-[86%] max-w-sm md:hidden border-r border-white/10 bg-zinc-950/100 shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.8 }}
            >
              <div className="flex h-16 items-center justify-between px-4">
                <span className="text-lg font-semibold text-white">Menu</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-2 text-zinc-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  ✕
                </button>
              </div>

              <nav className="px-2 pb-8">
                {navItems.map((item) =>
                  item.sub ? (
                    <div key={item.name} className="px-2">
                      <button
                        onClick={() => {
                          if (item.name === "Products") setMobileProductsOpen((v) => !v);
                          if (item.name === "Brochures") setMobileBrochuresOpen((v) => !v);
                        }}
                        aria-expanded={
                          (item.name === "Products" && mobileProductsOpen) ||
                          (item.name === "Brochures" && mobileBrochuresOpen)
                        }
                        className="flex w-full items-center justify-between rounded-lg px-3.5 py-3 text-base font-medium text-zinc-200 hover:bg-white/5 hover:text-white"
                      >
                        <span>{item.name}</span>
                        <ChevronDown
                          size={18}
                          className={`transition-transform duration-300 ${((item.name === "Products" && mobileProductsOpen) ||
                            (item.name === "Brochures" && mobileBrochuresOpen)) ? "rotate-180" : ""
                            }`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {(item.name === "Products" && mobileProductsOpen) ||
                          (item.name === "Brochures" && mobileBrochuresOpen) ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="mt-1 space-y-1 rounded-lg pl-2">
                              {item.sub.map((sub) => (
                                item.name === "Brochures" ? (
                                  <BrochureItem key={sub.name} item={sub} isMobile={true} />
                                ) : (
                                  <Link
                                    key={sub.name}
                                    href={sub.path}
                                    onClick={() => setMobileOpen(false)}
                                    className={`block rounded-md px-3.5 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white ${isActive(sub.path) ? "bg-white/5 text-white" : ""
                                      }`}
                                  >
                                    {sub.name}
                                  </Link>
                                )
                              ))}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <Link
                      key={item.name}
                      href={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`mx-2 mt-1 block rounded-lg px-3.5 py-3 text-base font-medium text-zinc-200 hover:bg-white/5 hover:text-white ${isActive(item.path) ? "bg-white/5 text-white" : ""
                        }`}
                    >
                      {item.name}
                    </Link>
                  )
                )}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}