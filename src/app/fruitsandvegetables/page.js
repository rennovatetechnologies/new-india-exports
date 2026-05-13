"use client";
import Image from "next/image";
import { motion } from "framer-motion";

export default function FruitsVegetablesPage() {
  const products = [
    {
      name: "LEMON",
      image: "/fruits/lemons.jpg",
      specs: `Fresh lemon originates from tropical Southeast Asia where it can still be found wild. 
      Cultivated based on sweetness (usually sour) and color (yellow or green). 
      We offer juicy fresh lemons at competitive prices.`,
      packaging: `10/20/25 KGS  
25/26 LEMON IN 1KG  
8 KGS TOP BOTTOM CORRUGATED BOX.`,
    },
    {
      name: "ONION",
      image: "/fruits/onion.jpg",
      specs: `Red onion is one of the popular varieties of onion. It’s rich in Vitamin C and improves blood circulation. 
      Known for its freshness, aroma, and taste.`,
      packaging: `Net, PP, mesh/leno, or jute bags.  
Available sizes: 25 kg, 30 kg, 50 kg.  
Onion size: 55mm+`,
    },
    {
      name: "CHILLY",
      image: "/fruits/chili.jpg",
      specs: `Chilly is a spice exported to the Middle East and Europe on a large scale. 
      Cultivated in India, it ranges from medium to extremely hot.`,
      packaging: `4.5 KGS TOP BOTTOM CORRUGATED BOX  
or in LENO/MESH BAGS.`,
    },
    {
      name: "ALPHONSO / HAPUS MANGO",
      image: "/fruits/mango.jpg",
      specs: `Origin: Ratnagiri / Devgad.  
Rich source of Vitamin A and minerals. We procure directly from farmers, 
ensuring rich taste and freshness at a competitive price.`,
      packaging: `1 or 2 dozen mangoes in corrugated box.  
5 dozen in wooden or corrugated box.`,
    },
    {
      name: "ORANGE",
      image: "/fruits/orange.jpg",
      specs: `Fresh Indian oranges are rich in Vitamin C and antioxidants, known for their natural sweetness, juiciness, and vibrant color.
Sourced directly from trusted farmers, ensuring freshness and taste that meet export standards.
Varieties include Nagpur Orange and Kinnow — popular for their aroma and flavor.`,
      packaging: ``,
    },
    {
      name: "BRINJAL",
      image: "/fruits/brinjal.jpg",
      specs: `Fresh brinjals are hand-picked from farms to ensure firmness, shine, and deep color.
Rich in dietary fiber and essential nutrients, perfect for various cuisines.
Available in multiple varieties — long, round, and striped.`,
      packaging: ``,
    },
  ];

  return (
    <main className="flex flex-col min-h-screen bg-[#fdf5e6]">
      {/* ==== HEADER SECTION ==== */}
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="Fruits and Vegetables"
          fill
          priority
          quality={100}
          className="object-cover brightness-75 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
        <div className="relative z-10 text-white px-6 mt-16 sm:mt-20">
          <div className="inline-block mb-6">
            <div className="w-20 h-1 bg-[#16a34a] mx-auto mb-4"></div>
            <h1 className="text-5xl sm:text-7xl font-bold mb-4 tracking-tight text-[#ffffff]">
              Fruits & Vegetables
            </h1>
            <div className="w-20 h-1 bg-[#16a34a] mx-auto"></div>
          </div>
          <p className="max-w-2xl mx-auto text-white text-lg sm:text-xl font-light tracking-wide">
            Freshness from Indian farms — delivered across the world.
          </p>
        </div>
      </section>

      {/* ==== PRODUCT SECTIONS ==== */}
      <section className="max-w-7xl mx-auto py-16 px-4 sm:px-8 space-y-20">
        {products.map((product, index) => (
          <motion.div
            key={product.name}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className={`flex flex-col md:flex-row items-center gap-10 ${
              index % 2 !== 0 ? "md:flex-row-reverse" : ""
            }`}
          >
            {/* Product Image */}
            <div className="relative w-full md:w-1/2 h-[350px] sm:h-[450px] overflow-hidden rounded-2xl shadow-lg">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover rounded-2xl hover:scale-105 transition-transform duration-500"
              />
            </div>

            {/* Product Text */}
            <div className="w-full md:w-1/2 text-gray-800">
              <h2 className="text-3xl sm:text-4xl font-bold text-[#166534] mb-4">
                {product.name}
              </h2>

              <h3 className="text-xl font-semibold text-[#14532d] mb-2">
                SPECIFICATIONS:
              </h3>
              <p className="text-base sm:text-lg leading-relaxed mb-4">
                {product.specs}
              </p>

              <h3 className="text-xl font-semibold text-[#14532d] mb-2">
                PACKAGING:
              </h3>
              <p className="text-base sm:text-lg leading-relaxed whitespace-pre-line">
                {product.packaging}
              </p>
            </div>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
