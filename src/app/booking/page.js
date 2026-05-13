"use client";
import Image from "next/image";
import { useState } from "react";

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [product, setProduct] = useState("");
  const [shipment, setShipment] = useState("");
  const [quantity, setQuantity] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");

  const handleFinalSubmit = async () => {
    const message = `New Booking Request:
Product: ${product}
Shipment: ${shipment}
Quantity: ${quantity}
Phone: ${phone}
Email: ${email}
Address: ${address}
Country: ${country}`;

    window.location.href = `mailto:Newindexport@gmail.com?subject=Booking Request&body=${encodeURIComponent(message)}`;
  };

  const Popup = ({ children }) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-xl text-gray-900">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <section className="relative w-full h-[50vh] sm:h-[60vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="/Hero.jpg"
          alt="Booking Header"
          fill
          priority
          quality={80}
          className="object-cover brightness-75 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-transparent" />
        <div className="relative z-10 text-white px-6 mt-16 sm:mt-20">
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">Book Shipment</h1>
          <p className="max-w-2xl mx-auto text-white text-lg sm:text-xl font-light tracking-wide mt-4">
            Guided booking with simple pop‑ups
          </p>
        </div>
      </section>

      {/* Step 1 – Select Shipment */}
      {step === 1 && (
        <Popup>
          <h2 className="text-2xl font-bold mb-4">Select Shipment Type</h2>
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => {
                setShipment("Air");
                setStep(2);
              }}
              className="w-1/2 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
            >
              Air
            </button>
            <button
              onClick={() => {
                setShipment("Sea");
                setStep(2);
              }}
              className="w-1/2 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700"
            >
              Sea
            </button>
          </div>
        </Popup>
      )}

      {/* Step 2 – Select Product */}
      {step === 2 && (
        <Popup>
          <h2 className="text-2xl font-bold mb-4">Select Product</h2>
          <select
            className="w-full p-3 border rounded-lg"
            onChange={(e) => setProduct(e.target.value)}
            defaultValue=""
          >
            <option value="">Choose product</option>
            <option>Spices</option>
            <option>Cereals & Pulses</option>
            <option>Organic Food</option>
            <option>Fruits & Vegetables</option>
            <option>Others</option>
          </select>
          <button
            onClick={() => product && setStep(3)}
            className="mt-5 w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
          >
            Next
          </button>
        </Popup>
      )}

      {/* Step 3 – Quantity */}
      {step === 3 && (
        <Popup>
          <h2 className="text-2xl font-bold mb-4">Enter Quantity</h2>
          <input
            type="text"
            placeholder="Example: 500 kg"
            className="w-full p-3 border rounded-lg"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <button
            onClick={() => quantity && setStep(4)}
            className="mt-5 w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
          >
            Next
          </button>
        </Popup>
      )}

      {/* Step 4 – Contact Info */}
      {step === 4 && (
        <Popup>
          <h2 className="text-2xl font-bold mb-4">Contact Details</h2>

          <input
            type="text"
            placeholder="Phone Number"
            className="w-full p-3 mb-3 border rounded-lg"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            type="email"
            placeholder="Your Email"
            className="w-full p-3 mb-3 border rounded-lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="text"
            placeholder="Address"
            className="w-full p-3 mb-3 border rounded-lg"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <input
            type="text"
            placeholder="Country"
            className="w-full p-3 mb-3 border rounded-lg"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />

          <button
            onClick={() => phone && email && address && country && setStep(5)}
            className="mt-2 w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
          >
            Review
          </button>
        </Popup>
      )}

      {/* Step 5 – Review & Send */}
      {step === 5 && (
        <Popup>
          <h2 className="text-2xl font-bold mb-4">Review Your Details</h2>
          <p><strong>Shipment:</strong> {shipment}</p>
          <p><strong>Product:</strong> {product}</p>
          <p><strong>Quantity:</strong> {quantity}</p>
          <p><strong>Phone:</strong> {phone}</p>
          <p><strong>Email:</strong> {email}</p>
          <p><strong>Address:</strong> {address}</p>
          <p><strong>Country:</strong> {country}</p>

          <button
            onClick={handleFinalSubmit}
            className="mt-5 w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700"
          >
            Send Booking Request
          </button>
        </Popup>
      )}
    </div>
  );
}
