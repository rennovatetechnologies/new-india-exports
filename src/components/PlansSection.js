"use client";

import { motion } from "framer-motion";
import { FaCheck } from "react-icons/fa";

const plans = [
  {
    name: "Basic Plan",
    price: "₹ 33999 + GST",
    color: "border-gray-300",
    tagColor: "bg-gray-700",
    features: [
      { text: "Gumasta License / Shop Act Registration", available: true },
      { text: "MSME Registration", available: true },
      { text: "IEC (Import Export Code)", available: true },
      { text: "Bank Account Assistance", available: true },
      { text: "GST Registration & LUT Filing", available: true },
      { text: "AD Code Generation", available: true },
      { text: "RCMC Certificate", available: true },
      { text: "Phytosanitary / Fumigation Certification", available: true },
      { text: "DSC (Digital Signature Certificate - Class 3)", available: true },

      // Unavailable
      { text: "DGFT (Registration & Integration)", available: false },
      { text: "ICEGATE (Registration & Integration)", available: false },
      { text: "AD Code (Registration & Approval)", available: false },
      { text: "IFSC / PFMS (Registration & Approval)", available: false },
      { text: "Company Formation", available: false },
      { text: "Trademark Application", available: false },
      { text: "Digital Platform Assistance", available: false },
      { text: "Quality Assessment Certification Support", available: false },
      { text: "Pre & Post Shipment Documentation", available: false },
      { text: "Shipment Cost Analysis & Statement", available: false },
      { text: "Expert Reviews & Compliance Guidance", available: false },
      { text: "Exhibition Exposure & Networking", available: false },
    ],
    days: "Liaisoning - 22 Days",
  },

  {
    name: "Standard Plan",
    price: "₹ 43999 + GST",
    color: "border-cyan-400",
    tagColor: "bg-cyan-700",
    features: [
      { text: "Gumasta License / Shop Act Registration", available: true },
      { text: "MSME Registration", available: true },
      { text: "IEC (Import Export Code)", available: true },
      { text: "Bank Account Assistance", available: true },
      { text: "GST Registration & LUT Filing", available: true },
      { text: "AD Code Generation", available: true },
      { text: "RCMC Certificate", available: true },
      { text: "Phytosanitary / Fumigation Certification", available: true },
      { text: "DSC (Digital Signature Certificate - Class 3)", available: true },
      { text: "DGFT (Registration & Integration)", available: true },
      { text: "ICEGATE (Registration & Integration)", available: true },
      { text: "AD Code (Registration & Approval)", available: true },
      { text: "IFSC / PFMS (Registration & Approval)", available: true },

      // Unavailable
      { text: "Company Formation", available: false },
      { text: "Trademark Application", available: false },
      { text: "Digital Platform Assistance", available: false },
      { text: "Quality Assessment Certification Support", available: false },
      { text: "Pre & Post Shipment Documentation", available: false },
      { text: "Shipment Cost Analysis & Statement", available: false },
      { text: "Expert Reviews & Compliance Guidance", available: false },
      { text: "Exhibition Exposure & Networking", available: false },
    ],
    days: "Liaisoning - 22 Days",
  },

  {
    name: "Premium Plan",
    price: "₹ 83999 + GST",
    color: "border-yellow-400",
    tagColor: "bg-yellow-600",
    features: [
      { text: "Gumasta License / Shop Act Registration", available: true },
      { text: "MSME Registration", available: true },
      { text: "IEC (Import Export Code)", available: true },
      { text: "Bank Account Assistance", available: true },
      { text: "GST Registration & LUT Filing", available: true },
      { text: "AD Code Generation", available: true },
      { text: "RCMC Certificate", available: true },
      { text: "Phytosanitary / Fumigation Certification", available: true },
      { text: "DSC (Digital Signature Certificate - Class 3)", available: true },
      { text: "DGFT (Registration & Integration)", available: true },
      { text: "ICEGATE (Registration & Integration)", available: true },
      { text: "AD Code (Registration & Approval)", available: true },
      { text: "IFSC / PFMS (Registration & Approval)", available: true },
      { text: "Company Formation", available: true },
      { text: "Trademark Application", available: true },
      { text: "Digital Platform Assistance", available: true },
      { text: "Quality Assessment Certification Support", available: true },
      { text: "Pre & Post Shipment Documentation", available: true },
      { text: "Shipment Cost Analysis & Statement", available: true },
      { text: "Expert Reviews & Compliance Guidance", available: true },
      { text: "Exhibition Exposure & Networking", available: true },
    ],
    days: "Liaisoning - 45 Days",
  },
];

export default function PlansSection() {
  return (
    <section className="bg-[#0f0f0f] text-white py-16 px-6 md:px-16">
      <h2 className="text-4xl font-bold text-center mb-12">Our Consultancy Plans</h2>

      <div className="grid md:grid-cols-3 gap-10">
        {plans.map((plan, idx) => (
          <motion.div
            key={idx}
            whileHover={{ scale: 1.03 }}
            transition={{ duration: 0.3 }}
            className={`p-6 rounded-3xl border-2 ${plan.color} bg-[#151515] shadow-xl`}
          >
            <div className={`inline-block px-4 py-1 rounded-lg text-lg font-semibold text-white ${plan.tagColor}`}>
              {plan.name}
            </div>

            <p className="text-xl font-bold mt-2 mb-4">{plan.price}</p>

            <ul className="space-y-2">
              {plan.features.map((f, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-3 ${
                    f.available ? "text-white" : "text-gray-500 line-through"
                  }`}
                >
                  <FaCheck className={f.available ? "text-green-400 mt-1" : "text-gray-600 mt-1"} />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>

            <p className="text-center mt-6 text-sm text-gray-300">{plan.days}</p>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-gray-400 text-sm mt-10">* T&C Applied</p>
    </section>
  );
}
