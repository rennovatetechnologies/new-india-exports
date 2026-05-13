"use client";

export default function PayButton() {
  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handlePayment = async () => {
    try {
      // 0. Ensure Razorpay script is loaded
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error("Failed to load Razorpay SDK");

      // 1. Create order via Next.js API route
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 50000 }), // ₹500 in paise
      });

      const order = await res.json();

      if (!order.id) throw new Error(order.detail || order.error || "Order creation failed");

      // 2. Open Razorpay Checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_live_Sk6wplrNSRrt1d",
        amount: order.amount,
        currency: "INR",
        name: "New India Export",
        description: "Standard Checkout",
        order_id: order.id,

        handler: async function (response) {
          // 3. Verify payment via Next.js API route
          const verifyRes = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });

          const result = await verifyRes.json();

          if (result.success) {
            alert("Payment successful!");
          } else {
            alert("Payment verification failed");
          }
        },
      };

      const rzp = new window.Razorpay(options);

      rzp.on("payment.failed", function (response) {
        alert("Payment failed: " + response.error.description);
      });

      rzp.open();
    } catch (err) {
      console.error("Payment initiation error:", err);
      alert("Payment error: " + (err.message || "Something went wrong."));
    }
  };

  return (
    <button
      onClick={handlePayment}
      className="px-6 py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
    >
      Pay ₹500
    </button>
  );
}
