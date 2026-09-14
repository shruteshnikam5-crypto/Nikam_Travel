const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const cors = require("cors");
const express = require("express");
const Razorpay = require("razorpay");
const { NIKAM_BUSES, findNikamBus } = require("./data");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const RAZORPAY_MODE = String(process.env.RAZORPAY_MODE || "test").trim();
const DEMO_PAYMENT = String(process.env.DEMO_PAYMENT || "false").trim().toLowerCase() === "true";
const RAZORPAY_KEY_ID = String(process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");
const USERS_FILE = path.join(__dirname, "users.json");
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "admin").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const pendingOrders = new Map();
const completedPaymentOrders = new Map();
const adminTokens = new Map();
const userTokens = new Map();

ensureBookingsFile();
ensureUsersFile();
printStartupDiagnostics();

const razorpayConfig = getRazorpayConfigStatus();
const razorpay = !DEMO_PAYMENT && razorpayConfig.ready
  ? new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    })
  : null;

if (DEMO_PAYMENT) {
  console.warn("[payment-config] DEMO_PAYMENT=true. Razorpay checkout is bypassed and bookings are saved as demo paid.");
} else if (!razorpayConfig.ready) {
  console.warn("[razorpay-config] Razorpay is not ready:", razorpayConfig.reason);
  console.warn("[razorpay-config] Put real TEST keys in .env and restart with npm start.");
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "Nikam Travel API",
    envFile: path.join(__dirname, ".env"),
    razorpayMode: RAZORPAY_MODE,
    demoPayment: DEMO_PAYMENT,
    razorpayReady: !DEMO_PAYMENT && razorpayConfig.ready,
    razorpayReason: razorpayConfig.reason,
    keyPrefix: maskKey(RAZORPAY_KEY_ID),
  });
});

app.get("/api/buses", (req, res) => {
  res.json({
    success: true,
    buses: NIKAM_BUSES.filter((bus) => bus.active !== false),
  });
});

app.post("/api/register", (req, res) => {
  try {
    const user = sanitizeUser(req.body);
    const users = readUsers();
    const exists = users.some((item) =>
      item.mobile === user.mobile || String(item.email).toLowerCase() === user.email
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "This mobile number or email is already registered.",
      });
    }

    const savedUser = {
      id: makeUserId(user.mobile),
      name: user.name,
      age: user.age,
      mobile: user.mobile,
      email: user.email,
      passwordHash: hashPassword(user.password),
      status: "ACTIVE",
      registeredAt: new Date().toISOString(),
    };

    users.push(savedUser);
    writeUsers(users);

    return res.status(201).json({
      success: true,
      user: publicUser(savedUser),
    });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: getErrorMessage(err),
    });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const mobile = String(req.body.mobile || "").trim();
    const password = String(req.body.password || "");

    if (!/^[6-9]\d{9}$/.test(mobile) || !password) {
      return res.status(400).json({
        success: false,
        message: "Valid mobile number and password are required.",
      });
    }

    const user = readUsers().find((item) =>
      item.mobile === mobile && item.passwordHash === hashPassword(password) && item.status !== "BLOCKED"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid mobile number or password.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    userTokens.set(token, { userId: user.id, mobile: user.mobile, createdAt: Date.now() });

    return res.json({
      success: true,
      token,
      user: publicUser(user),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!ADMIN_PASSWORD || username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin username or password. Configure ADMIN_USERNAME and ADMIN_PASSWORD in .env for local admin access.",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");
  adminTokens.set(token, { username, createdAt: Date.now() });

  return res.json({
    success: true,
    token,
    admin: { username },
  });
});

app.post("/api/create-order", requireCustomerApi, async (req, res) => {
  try {
    const booking = sanitizeBooking(req.body.bookingData);
    if (booking.userId !== req.user.id || booking.email !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "Booking customer does not match the logged in user.",
      });
    }
    assertSeatsAvailable(booking.busNumber, booking.travelDate, booking.seats);
    const expectedTotal = calculateTotalAmount(booking.seats, booking.pricePerSeat);
    const amountPaise = calculateAmountInPaise(expectedTotal);
    const receipt = `nikam_${Date.now()}`;

    if (DEMO_PAYMENT) {
      const order = {
        id: `order_demo_${Date.now()}`,
        amount: amountPaise,
        amountRupees: expectedTotal,
        currency: "INR",
        receipt,
      };

      pendingOrders.set(order.id, {
        booking,
        amountPaise,
        createdAt: Date.now(),
        demo: true,
      });

      return res.status(201).json({
        success: true,
        demoPayment: true,
        keyId: "demo_key",
        order,
        booking: {
          pricePerSeat: booking.pricePerSeat,
          totalAmount: booking.totalAmount,
        },
      });
    }

    if (!razorpayConfig.ready || !razorpay) {
      return res.status(500).json({
        success: false,
        code: "RAZORPAY_CONFIG_MISSING",
        message:
          "Razorpay Test keys are not configured. Add real RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env, then restart server.",
        debug: {
          envFile: path.join(__dirname, ".env"),
          reason: razorpayConfig.reason,
          keyIdLoaded: Boolean(RAZORPAY_KEY_ID),
          keySecretLoaded: Boolean(RAZORPAY_KEY_SECRET),
          keyPrefix: maskKey(RAZORPAY_KEY_ID),
        },
      });
    }

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: {
        project: "Nikam Travel",
        busName: booking.busName,
        seatCount: String(booking.seats.length),
        totalAmount: String(expectedTotal),
      },
    });

    pendingOrders.set(order.id, {
      booking,
      amountPaise,
      createdAt: Date.now(),
    });

    return res.status(201).json({
      success: true,
      keyId: RAZORPAY_KEY_ID,
      order: {
        id: order.id,
        amount: order.amount,
        amountRupees: order.amount / 100,
        currency: order.currency,
        receipt: order.receipt,
      },
      booking: {
        pricePerSeat: booking.pricePerSeat,
        totalAmount: booking.totalAmount,
      },
    });
  } catch (err) {
    logRazorpayError("[create-order] failed", err);

    return res.status(getRazorpayStatusCode(err)).json({
      success: false,
      message: getErrorMessage(err),
      code: err.error?.code || err.code || "RAZORPAY_ORDER_CREATE_FAILED",
    });
  }
});

app.post("/api/verify-payment", requireCustomerApi, (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay payment verification fields.",
      });
    }

    const pending = pendingOrders.get(razorpay_order_id);

    if (!pending) {
      const completed = completedPaymentOrders.get(razorpay_order_id);

      if (completed) {
        return res.json({
          success: true,
          message: "Payment already verified and booking already saved.",
          booking: completed,
          duplicate: true,
        });
      }

      return res.status(400).json({
        success: false,
        message: "Payment order was not created by this server session. Please create a fresh booking.",
      });
    }

    if (pending.booking.userId !== req.user.id || pending.booking.email !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "Payment order does not belong to the logged in user.",
      });
    }

    assertSeatsAvailable(pending.booking.busNumber, pending.booking.travelDate, pending.booking.seats);
    const expectedAmountPaise = calculateAmountInPaise(pending.booking.totalAmount);

    if (pending.amountPaise !== expectedAmountPaise) {
      console.warn("[verify-payment] amount mismatch", {
        orderId: razorpay_order_id,
        expectedAmountPaise: expectedAmountPaise,
        receivedAmountPaise: pending.amountPaise,
      });

      return res.status(400).json({
        success: false,
        message: "Payment amount mismatch. Please try again.",
      });
    }

    let signatureIsValid = false;

    if (pending.demo && DEMO_PAYMENT) {
      signatureIsValid =
        String(razorpay_payment_id).startsWith("pay_demo_") &&
        String(razorpay_signature) === "demo_signature";
    } else {
      const expectedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      const receivedSignature = String(razorpay_signature);
      signatureIsValid =
        expectedSignature.length === receivedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature));
    }

    if (!signatureIsValid) {
      console.warn("[verify-payment] invalid signature", {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      });

      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed.",
      });
    }

    const bookings = readBookings();
    const savedBooking = {
      id: Date.now(),
      bookingId: `NT${Date.now()}`,
      ...pending.booking,
      seatCount: pending.booking.seats.length,
      subtotal: pending.booking.subtotal,
      fees: pending.booking.fees,
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpayAmountPaise: pending.amountPaise,
      paymentStatus: "PAID",
      bookingStatus: "CONFIRMED",
      paymentMode: pending.demo ? "demo" : "razorpay",
      createdAt: new Date().toISOString(),
    };

    bookings.push(savedBooking);
    writeBookings(bookings);
    pendingOrders.delete(razorpay_order_id);
    completedPaymentOrders.set(razorpay_order_id, savedBooking);

    return res.json({
      success: true,
      message: "Payment verified and booking saved.",
      booking: savedBooking,
    });
  } catch (err) {
    console.error("[verify-payment] failed", err);

    return res.status(500).json({
      success: false,
      message: getErrorMessage(err),
    });
  }
});

app.get("/api/booked-seats", (req, res) => {
  try {
    const busNumber = String(req.query.busNumber || "").trim();
    const travelDate = String(req.query.travelDate || "").trim();

    if (!busNumber || !travelDate) {
      return res.status(400).json({
        success: false,
        message: "busNumber and travelDate are required.",
      });
    }

    const seats = readBookings()
      .filter((booking) =>
        booking.busNumber === busNumber &&
        booking.travelDate === travelDate &&
        String(booking.bookingStatus || "CONFIRMED").toUpperCase() !== "CANCELLED"
      )
      .flatMap((booking) => (Array.isArray(booking.seats) ? booking.seats : []));

    return res.json(seats);
  } catch (err) {
    console.error("[booked-seats] failed", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load booked seats.",
    });
  }
});

app.get("/api/admin/bookings", requireAdminApi, (req, res) => {
  try {
    return res.json(readBookings().slice().reverse());
  } catch (err) {
    console.error("[admin-bookings] failed", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load bookings.",
    });
  }
});

app.get("/api/admin/users", requireAdminApi, (req, res) => {
  try {
    const bookings = readBookings();
    const users = readUsers().map((user) => ({
      ...publicUser(user),
      bookingCount: bookings.filter((booking) =>
        String(booking.userId || "").toLowerCase() === String(user.id).toLowerCase() ||
        String(booking.email || "").toLowerCase() === String(user.email).toLowerCase()
      ).length,
    }));

    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Unable to load users.",
    });
  }
});

app.get("/api/admin/stats", requireAdminApi, (req, res) => {
  try {
    const bookings = readBookings();
    const users = readUsers();
    const today = new Date().toISOString().slice(0, 10);
    const status = (value) => String(value || "").toUpperCase();
    const confirmed = bookings.filter((booking) => status(booking.bookingStatus) === "CONFIRMED");

    return res.json({
      success: true,
      stats: {
        totalUsers: users.length,
        totalBookings: bookings.length,
        confirmedBookings: confirmed.length,
        pendingBookings: bookings.filter((booking) => status(booking.bookingStatus) === "PENDING").length,
        cancelledBookings: bookings.filter((booking) => status(booking.bookingStatus) === "CANCELLED").length,
        totalRevenue: confirmed
          .filter((booking) => status(booking.paymentStatus) === "PAID")
          .reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0),
        todaysBookings: bookings.filter((booking) => String(booking.createdAt || "").slice(0, 10) === today).length,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard stats.",
    });
  }
});

app.get("/api/my-bookings", requireCustomerApi, (req, res) => {
  try {
    const bookings = readBookings()
      .filter((booking) =>
        String(booking.userId || "").toLowerCase() === String(req.user.id).toLowerCase() ||
        String(booking.email || "").trim().toLowerCase() === req.user.email
      )
      .reverse();

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error("[my-bookings] failed", err);

    return res.status(500).json({
      success: false,
      message: "Unable to load bookings.",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

app.use((err, req, res, next) => {
  console.error("[express] unhandled error", err);
  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.info(`Nikam Travel API running on port ${PORT}`);
    console.info(`Razorpay mode: ${RAZORPAY_MODE}; ready: ${razorpayConfig.ready}`);
  });
}

function printStartupDiagnostics() {
  if (String(process.env.DEBUG_STARTUP || "").toLowerCase() !== "true") return;
  const envPath = path.join(__dirname, ".env");
  console.info("[startup] cwd:", process.cwd());
  console.info("[startup] project root:", __dirname);
  console.info("[startup] .env path:", envPath);
  console.info("[startup] .env exists:", fs.existsSync(envPath));
  console.info("[startup] dotenv package: loaded");
  console.info("[startup] PORT:", PORT);
  console.info("[startup] RAZORPAY_MODE:", RAZORPAY_MODE);
  console.info("[startup] DEMO_PAYMENT:", DEMO_PAYMENT);
  console.info("[startup] RAZORPAY_KEY_ID loaded:", Boolean(RAZORPAY_KEY_ID), maskKey(RAZORPAY_KEY_ID));
  console.info("[startup] RAZORPAY_KEY_SECRET loaded:", Boolean(RAZORPAY_KEY_SECRET));
}

function getRazorpayConfigStatus() {
  if (RAZORPAY_MODE !== "test") {
    return { ready: false, reason: "RAZORPAY_MODE must be test for this project." };
  }

  if (!RAZORPAY_KEY_ID) {
    return { ready: false, reason: "RAZORPAY_KEY_ID is missing from .env." };
  }

  if (!RAZORPAY_KEY_SECRET) {
    return { ready: false, reason: "RAZORPAY_KEY_SECRET is missing from .env." };
  }

  if (!RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
    return { ready: false, reason: "RAZORPAY_KEY_ID must start with rzp_test_." };
  }

  if (isPlaceholder(RAZORPAY_KEY_ID) || isPlaceholder(RAZORPAY_KEY_SECRET)) {
    return { ready: false, reason: "Razorpay keys in .env are placeholders, not real test keys." };
  }

  return { ready: true, reason: "Razorpay test keys loaded." };
}

function sanitizeBooking(data) {
  if (!data || typeof data !== "object") {
    const err = new Error("Missing booking details.");
    err.statusCode = 400;
    throw err;
  }

  const seats = Array.isArray(data.seats)
    ? data.seats.map((seat) => String(seat).trim()).filter(Boolean)
    : [];
  const bus = findNikamBus(String(data.busId || ""));
  const passengerName = String(data.passengerName || data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const mobile = String(data.mobile || "").trim();
  const age = Number(data.age || 0);
  const travelDate = String(data.travelDate || "").trim();

  if (!bus) {
    const err = new Error("Selected bus is invalid. Please choose the bus again.");
    err.statusCode = 400;
    throw err;
  }

  if (!passengerName || !email || !mobile) {
    const err = new Error("Passenger name, email and mobile are required.");
    err.statusCode = 400;
    throw err;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error("Valid passenger email is required.");
    err.statusCode = 400;
    throw err;
  }

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    const err = new Error("Valid 10 digit mobile number is required.");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isInteger(age) || age < 18) {
    const err = new Error("Passenger age must be 18 or above.");
    err.statusCode = 400;
    throw err;
  }

  if (!isFutureOrToday(travelDate)) {
    const err = new Error("Travel date cannot be in the past.");
    err.statusCode = 400;
    throw err;
  }

  const pricePerSeat = bus.price;
  const totalAmount = toPositiveInteger(data.totalAmount, "Total amount");

  if (seats.length === 0) {
    const err = new Error("Booking must include at least one seat.");
    err.statusCode = 400;
    throw err;
  }

  const calculatedTotal = calculateTotalAmount(seats, pricePerSeat);

  if (totalAmount !== calculatedTotal) {
    const err = new Error("Amount mismatch. The booking total does not match the selected seats and seat price.");
    err.statusCode = 400;
    err.details = {
      receivedTotalAmount: totalAmount,
      calculatedTotalAmount: calculatedTotal,
      seatCount: seats.length,
      pricePerSeat,
    };
    throw err;
  }

  return {
    userId: String(data.userId || email).trim(),
    passengerName,
    name: passengerName,
    email,
    mobile,
    age,
    busId: bus.id,
    busNumber: bus.busNumber,
    busName: bus.name,
    from: bus.from,
    to: bus.to,
    departureTime: bus.departureTime,
    arrivalTime: bus.arrivalTime,
    busTime: `${bus.departureTime} - ${bus.arrivalTime}`,
    duration: bus.duration,
    distance: bus.distance,
    busType: bus.type,
    seatType: bus.seatType,
    travelDate,
    seats,
    pricePerSeat,
    seatPrice: pricePerSeat,
    subtotal: calculatedTotal,
    fees: 0,
    totalAmount,
    paymentStatus: "PENDING",
    bookingStatus: "PENDING",
  };
}

function sanitizeUser(data) {
  const name = String(data.name || "").trim();
  const age = Number(data.age || 0);
  const mobile = String(data.mobile || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");

  if (!name || !mobile || !email || !password) {
    const err = new Error("Full name, age, mobile, email and password are required.");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isInteger(age) || age < 18) {
    const err = new Error("Age must be 18 or above.");
    err.statusCode = 400;
    throw err;
  }

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    const err = new Error("Enter a valid 10 digit mobile number.");
    err.statusCode = 400;
    throw err;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error("Enter a valid email address.");
    err.statusCode = 400;
    throw err;
  }

  if (password.length < 6) {
    const err = new Error("Password must be at least 6 characters.");
    err.statusCode = 400;
    throw err;
  }

  return { name, age, mobile, email, password };
}

function calculateTotalAmount(seats, seatPrice) {
  return seats.length * seatPrice;
}

function calculateAmountInPaise(amountRupees) {
  return Math.round(Number(amountRupees) * 100);
}

function toPositiveInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    const err = new Error(`${label} must be a positive whole rupee amount.`);
    err.statusCode = 400;
    throw err;
  }

  return number;
}

function assertSeatsAvailable(busNumber, travelDate, seats) {
  const alreadyBooked = new Set(
    readBookings()
      .filter((booking) =>
        booking.busNumber === busNumber &&
        booking.travelDate === travelDate &&
        String(booking.bookingStatus || "CONFIRMED").toUpperCase() !== "CANCELLED"
      )
      .flatMap((booking) => (Array.isArray(booking.seats) ? booking.seats : []))
  );

  const duplicateRequestSeats = seats.filter((seat, index) => seats.indexOf(seat) !== index);
  if (duplicateRequestSeats.length) {
    const err = new Error("Duplicate seats are not allowed.");
    err.statusCode = 400;
    throw err;
  }

  const blocked = seats.filter((seat) => alreadyBooked.has(seat));
  if (blocked.length) {
    const err = new Error(`Seat already booked: ${blocked.join(", ")}`);
    err.statusCode = 409;
    throw err;
  }
}

function isFutureOrToday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${value}T00:00:00`);
  return date >= today;
}

function requireAdminApi(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({
      success: false,
      message: "Admin authorization required.",
    });
  }

  return next();
}

function requireCustomerApi(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = token ? userTokens.get(token) : null;

  if (!session) {
    return res.status(401).json({
      success: false,
      message: "Please login to continue booking.",
    });
  }

  const user = readUsers().find((item) => item.id === session.userId && item.status !== "BLOCKED");
  if (!user) {
    userTokens.delete(token);
    return res.status(401).json({
      success: false,
      message: "Please login to continue booking.",
    });
  }

  req.user = publicUser(user);
  return next();
}

function ensureBookingsFile() {
  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, "[]\n");
  }
}

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]\n");
  }
}

function readBookings() {
  ensureBookingsFile();
  const raw = fs.readFileSync(BOOKINGS_FILE, "utf8").trim() || "[]";
  const bookings = JSON.parse(raw);
  return Array.isArray(bookings) ? bookings : [];
}

function writeBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, `${JSON.stringify(bookings, null, 2)}\n`);
}

function readUsers() {
  ensureUsersFile();
  const raw = fs.readFileSync(USERS_FILE, "utf8").trim() || "[]";
  const users = JSON.parse(raw);
  return Array.isArray(users) ? users : [];
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`);
}

function makeUserId(seed) {
  return `USER-${String(seed || Date.now()).replace(/\D/g, "").slice(-10)}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    age: user.age,
    mobile: user.mobile,
    email: user.email,
    status: user.status || "ACTIVE",
    registeredAt: user.registeredAt,
  };
}

function isPlaceholder(value) {
  return /replace|your_|placeholder|here/i.test(String(value));
}

function maskKey(value) {
  if (!value) {
    return "(empty)";
  }

  return `${value.slice(0, 8)}...`;
}

function logRazorpayError(prefix, err) {
  console.error(prefix, {
    statusCode: err.statusCode,
    code: err.error?.code || err.code,
    description: err.error?.description,
    reason: err.error?.reason,
    field: err.error?.field,
    message: err.message,
  });
}

function getRazorpayStatusCode(err) {
  return Number(err.statusCode || err.error?.status_code || 500);
}

function getErrorMessage(err) {
  if (err.error?.description) {
    return err.error.description;
  }

  if (err.message) {
    return err.message;
  }

  return "Something went wrong.";
}

module.exports = app;
module.exports.app = app;
module.exports.sanitizeBooking = sanitizeBooking;
module.exports.calculateTotalAmount = calculateTotalAmount;
module.exports.calculateAmountInPaise = calculateAmountInPaise;
module.exports.NIKAM_BUSES = NIKAM_BUSES;
