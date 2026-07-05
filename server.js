const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* 🔥 RAZORPAY */
const razorpay = new Razorpay({
  key_id: "rzp_test_SaEwY3yCcRHU8m",
  key_secret: "eVkHGJW5Tw6HUU8rl4dWQeoV",
});

/* 📂 FILE */
const bookingsFile = path.join(__dirname, "bookings.json");

if (!fs.existsSync(bookingsFile)) {
  fs.writeFileSync(bookingsFile, JSON.stringify([], null, 2));
}

function getBookings() {
  return JSON.parse(fs.readFileSync(bookingsFile));
}

function saveBookings(data) {
  fs.writeFileSync(bookingsFile, JSON.stringify(data, null, 2));
}

/* 🔥 CREATE ORDER */
app.post("/api/create-order", async (req, res) => {
  const { amount } = req.body;

  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
  });

  res.json(order);
});

/* 🔥 VERIFY + SAVE */
app.post("/api/verify-payment", (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    bookingData
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expected = crypto
    .createHmac("sha256", "YOUR_KEY_SECRET")
    .update(body)
    .digest("hex");

  if (expected === razorpay_signature) {

    const bookings = getBookings();

    bookings.push({
      id: Date.now(),
      ...bookingData,
      paymentId: razorpay_payment_id,
      createdAt: new Date().toLocaleString()
    });

    saveBookings(bookings);

    res.json({ success: true });

  } else {
    res.status(400).json({ success: false });
  }
});

/* 🔥 BOOKED SEATS */
app.get("/api/booked-seats", (req, res) => {

  const { busNumber, travelDate } = req.query;

  const bookings = getBookings();

  const filtered = bookings.filter(b =>
    b.busNumber === busNumber && b.travelDate === travelDate
  );

  let seats = [];

  filtered.forEach(b => seats.push(...b.seats));

  res.json(seats);
});

/* 🔥 GET BOOKINGS */
app.get("/api/admin/bookings", (req, res) => {
  res.json(getBookings().reverse());
});

app.listen(PORT, () => {
  console.log("🚀 Server running http://localhost:3000");
});