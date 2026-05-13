"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ProductsSection() {
  const products = [
    {
      name: "SPICES",
      desc: "We provide a variety of Indian spices packed with freshness and aroma.",
      img: "/Spices.jpg",
      link: "/spices",
      color: "from-orange-500 to-red-600"
    },
    {
      name: "CEREALS AND PULSES",
      desc: "We provide top-quality cereals and pulses sourced directly from farms.",
      img: "/Pulses.jpg",
      link: "/cerealsandpulses",
      color: "from-amber-600 to-yellow-600"
    },
    {
      name: "ORGANIC FOOD",
      desc: "We deliver pure and natural organic food products for healthy living.",
      img: "/Organic.jpg",
      link: "/organicfood",
      color: "from-green-500 to-emerald-600"
    },
    {
      name: "FRUITS AND VEGETABLES",
      desc: "We supply fresh fruits and vegetables directly from Indian farms.",
      img: "/Veg1.jpg",
      link: "/fruitsandvegetables",
      color: "from-lime-500 to-green-600"
    },
    {
      name: "OTHERS",
      desc: "We also export various other agricultural and food products.",
      img: "/Others2.png",
      link: "/others",
      color: "from-blue-500 to-cyan-600"
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const cardVariants = {
    hidden: { 
      opacity: 0, 
      y: 60,
      scale: 0.9
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.7,
        ease: "easeOut"
      }
    }
  };

  const imageVariants = {
    hover: {
      scale: 1.1,
      transition: {
        duration: 0.4,
        ease: "easeOut"
      }
    }
  };

  const contentVariants = {
    hover: {
      y: -10,
      transition: {
        duration: 0.3,
        ease: "easeOut"
      }
    }
  };

  return (
    <section className="w-full py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            Our Product Categories
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Discover our premium range of agricultural products, carefully sourced and delivered with excellence.
          </p>
        </motion.div>

        {/* Product Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {products.map((product, index) => (
            <motion.div
              key={index}
              variants={cardVariants}
              whileHover="hover"
              className="group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100"
            >
              {/* Image Container */}
              <motion.div 
                className="relative w-full h-64 overflow-hidden"
                variants={imageVariants}
              >
                <Image
                  src={product.img}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
                {/* Gradient Overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${product.color} opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
                
                {/* Hover Effect Layer */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-500" />
              </motion.div>

              {/* Content */}
              <motion.div 
                className="p-6 relative z-10"
                variants={contentVariants}
              >
                {/* Category Icon/Indicator */}
                <div className={`w-12 h-1 bg-gradient-to-r ${product.color} rounded-full mb-4`} />
                
                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-gray-800 transition-colors duration-300">
                  {product.name}
                </h3>
                
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  {product.desc}
                </p>

                {/* Enhanced Button */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    href={product.link}
                    className={`inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r ${product.color} text-white font-semibold text-sm hover:shadow-lg transition-all duration-300 group/btn`}
                  >
                    Explore Products
                    <motion.span
                      className="ml-2 group-hover/btn:translate-x-1 transition-transform duration-300"
                    >
                      →
                    </motion.span>
                  </Link>
                </motion.div>
              </motion.div>

              {/* Background Glow Effect */}
              <div className={`absolute inset-0 bg-gradient-to-br ${product.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500 rounded-2xl`} />
            </motion.div>
          ))}
        </motion.div>

        
      </div>
    </section>
  );
}