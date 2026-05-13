import Razorpay from "razorpay";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("Create order request body:", body);
    const { amount } = body;

    if (!amount || amount < 100) {
      console.error("Invalid amount:", amount);
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Fallback to provided live keys if env is missing due to root inference issues
    const key_id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_live_Sk6wplrNSRrt1d";
    const key_secret = process.env.RAZORPAY_KEY_SECRET || "tUDNN5E8z4OBS4OH2qKX7ZMR";

    if (!key_id || !key_secret) {
      console.error("Missing Razorpay credentials. key_id:", !!key_id, "key_secret:", !!key_secret);
      throw new Error("Razorpay Key ID or Secret is missing in root .env");
    }

    console.log("Using Razorpay Key:", key_id.substring(0, 8) + "...");

    const razorpay = new Razorpay({
      key_id: key_id,
      key_secret: key_secret,
    });

    const options = {
      amount, // in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    console.log("Creating Razorpay order with options:", options);
    const order = await razorpay.orders.create(options);
    console.log("Razorpay order created successfully:", order.id);

    return NextResponse.json(order);
  } catch (err) {
    console.error("Create order failure full error:", err);
    return NextResponse.json(
      { 
        error: "Order creation failed", 
        detail: err?.error?.description || err?.message || String(err) 
      },
      { status: 500 }
    );
  }
}
