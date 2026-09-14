const NIKAM_BUSES = [
  {
    id: "NT-PN-001",
    name: "Nikam Royal",
    busNumber: "MH-20-AB-2451",
    operator: "Nikam Travel",
    from: "Chhatrapati Sambhajinagar",
    to: "Pune",
    departureTime: "06:15 AM",
    arrivalTime: "12:30 PM",
    duration: "6h 15m",
    distance: "235 km",
    type: "AC",
    seatType: "Sleeper",
    seatLayout: "2+1 Sleeper",
    price: 799,
    availableSeats: 40,
    amenities: ["WiFi", "Charging", "Water Bottle"],
    decks: ["Lower Deck", "Upper Deck"],
    active: true
  },
  {
    id: "NT-MU-001",
    name: "Nikam Express",
    busNumber: "MH-20-CD-7812",
    operator: "Nikam Travel",
    from: "Chhatrapati Sambhajinagar",
    to: "Mumbai",
    departureTime: "09:30 PM",
    arrivalTime: "06:00 AM",
    duration: "8h 30m",
    distance: "330 km",
    type: "AC",
    seatType: "Semi-Sleeper",
    seatLayout: "2+1 Semi-Sleeper",
    price: 899,
    availableSeats: 40,
    amenities: ["Charging", "Blanket", "Reading Light"],
    decks: ["Lower Deck", "Upper Deck"],
    active: true
  },
  {
    id: "NT-MU-002",
    name: "Nikam Travels Premium",
    busNumber: "MH-20-EF-3490",
    operator: "Nikam Travel",
    from: "Chhatrapati Sambhajinagar",
    to: "Mumbai",
    departureTime: "07:45 AM",
    arrivalTime: "04:15 PM",
    duration: "8h 30m",
    distance: "330 km",
    type: "AC",
    seatType: "Sleeper",
    seatLayout: "2+1 Sleeper",
    price: 999,
    availableSeats: 40,
    amenities: ["WiFi", "Charging", "Water Bottle", "Blanket"],
    decks: ["Lower Deck", "Upper Deck"],
    active: true
  },
  {
    id: "NT-NS-001",
    name: "Nikam Sleeper",
    busNumber: "MH-20-GH-5624",
    operator: "Nikam Travel",
    from: "Chhatrapati Sambhajinagar",
    to: "Nashik",
    departureTime: "07:00 AM",
    arrivalTime: "12:00 PM",
    duration: "5h",
    distance: "195 km",
    type: "AC",
    seatType: "Sleeper",
    seatLayout: "2+1 Sleeper",
    price: 699,
    availableSeats: 40,
    amenities: ["Charging", "Blanket", "Reading Light"],
    decks: ["Lower Deck", "Upper Deck"],
    active: true
  },
  {
    id: "NT-NG-001",
    name: "Nikam Orange City Link",
    busNumber: "MH-20-JK-9185",
    operator: "Nikam Travel",
    from: "Chhatrapati Sambhajinagar",
    to: "Nagpur",
    departureTime: "08:15 PM",
    arrivalTime: "05:45 AM",
    duration: "9h 30m",
    distance: "490 km",
    type: "AC",
    seatType: "Sleeper",
    seatLayout: "2+1 Sleeper",
    price: 1199,
    availableSeats: 40,
    amenities: ["WiFi", "Charging", "Blanket", "Water Bottle"],
    decks: ["Lower Deck", "Upper Deck"],
    active: true
  }
];

const NIKAM_KEYS = {
  users: "nikamTravelUsers",
  session: "nikamTravelSession",
  booking: "nikamTravelBooking",
  lastBooking: "nikamTravelLastBooking",
  authToken: "nikamTravelAuthToken",
  legacyUser: "user",
  legacyLoggedIn: "isLoggedIn"
};

function findNikamBus(busId) {
  return NIKAM_BUSES.find((bus) => bus.id === busId && bus.active !== false) || null;
}

function getNikamSession() {
  if (typeof localStorage === "undefined") return null;

  try {
    const session = JSON.parse(localStorage.getItem(NIKAM_KEYS.session) || "null");
    if (session && session.user && session.user.email && session.user.mobile) {
      return session;
    }
  } catch (err) {
    localStorage.removeItem(NIKAM_KEYS.session);
  }

  return migrateLegacyNikamSession();
}

function migrateLegacyNikamSession() {
  if (typeof localStorage === "undefined") return null;

  try {
    const legacy = JSON.parse(localStorage.getItem(NIKAM_KEYS.legacyUser) || "null");
    if (localStorage.getItem(NIKAM_KEYS.legacyLoggedIn) === "true" && legacy && legacy.email && legacy.mobile) {
      const user = {
        id: legacy.id || makeNikamUserId(legacy.mobile),
        name: legacy.name,
        age: Number(legacy.age) || "",
        mobile: legacy.mobile,
        email: legacy.email
      };
      const session = { user, createdAt: new Date().toISOString() };
      localStorage.setItem(NIKAM_KEYS.session, JSON.stringify(session));
      return session;
    }
  } catch (err) {
    return null;
  }

  return null;
}

function setNikamSession(user) {
  const safeUser = {
    id: user.id || makeNikamUserId(user.mobile),
    name: user.name,
    age: Number(user.age),
    mobile: user.mobile,
    email: String(user.email || "").toLowerCase()
  };

  localStorage.setItem(NIKAM_KEYS.session, JSON.stringify({
    user: safeUser,
    createdAt: new Date().toISOString()
  }));

  localStorage.setItem(NIKAM_KEYS.legacyLoggedIn, "true");
  localStorage.setItem("userName", safeUser.name);
  localStorage.setItem("userEmail", safeUser.email);
  localStorage.setItem("userMobile", safeUser.mobile);
  localStorage.setItem("userAge", String(safeUser.age));
}

function setNikamAuthToken(token) {
  if (token) localStorage.setItem(NIKAM_KEYS.authToken, token);
}

function getNikamAuthToken() {
  return localStorage.getItem(NIKAM_KEYS.authToken) || "";
}

function clearNikamSession() {
  localStorage.removeItem(NIKAM_KEYS.session);
  localStorage.removeItem(NIKAM_KEYS.booking);
  localStorage.removeItem(NIKAM_KEYS.lastBooking);
  localStorage.removeItem(NIKAM_KEYS.authToken);
  localStorage.removeItem(NIKAM_KEYS.legacyLoggedIn);
  localStorage.removeItem("userName");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userMobile");
  localStorage.removeItem("userAge");
}

function logoutNikamCustomer() {
  clearNikamSession();
  window.location.href = "index.html";
}

function requireNikamCustomer() {
  const session = getNikamSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
    window.location.replace(`login.html?next=${next}`);
    return null;
  }
  return session.user;
}

function readNikamUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(NIKAM_KEYS.users) || "[]");
    return Array.isArray(users) ? users : [];
  } catch (err) {
    return [];
  }
}

function saveNikamUsers(users) {
  localStorage.setItem(NIKAM_KEYS.users, JSON.stringify(users));
}

function makeNikamUserId(seed) {
  return `USER-${String(seed || Date.now()).replace(/\D/g, "").slice(-10)}`;
}

function getNikamBookingState() {
  try {
    return JSON.parse(localStorage.getItem(NIKAM_KEYS.booking) || "null");
  } catch (err) {
    return null;
  }
}

function setNikamBookingState(state) {
  localStorage.setItem(NIKAM_KEYS.booking, JSON.stringify(state));
}

function clearNikamBookingState() {
  localStorage.removeItem(NIKAM_KEYS.booking);
}

function escapeNikamHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidNikamEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidNikamMobile(mobile) {
  return /^[6-9]\d{9}$/.test(String(mobile || "").trim());
}

function isStrongNikamPassword(password) {
  return String(password || "").length >= 6;
}

if (typeof window !== "undefined") {
  window.NIKAM_BUSES = NIKAM_BUSES;
  window.NIKAM_KEYS = NIKAM_KEYS;
  window.findNikamBus = findNikamBus;
  window.getNikamSession = getNikamSession;
  window.setNikamSession = setNikamSession;
  window.setNikamAuthToken = setNikamAuthToken;
  window.getNikamAuthToken = getNikamAuthToken;
  window.clearNikamSession = clearNikamSession;
  window.logoutNikamCustomer = logoutNikamCustomer;
  window.requireNikamCustomer = requireNikamCustomer;
  window.readNikamUsers = readNikamUsers;
  window.saveNikamUsers = saveNikamUsers;
  window.getNikamBookingState = getNikamBookingState;
  window.setNikamBookingState = setNikamBookingState;
  window.clearNikamBookingState = clearNikamBookingState;
  window.escapeNikamHtml = escapeNikamHtml;
  window.isValidNikamEmail = isValidNikamEmail;
  window.isValidNikamMobile = isValidNikamMobile;
  window.isStrongNikamPassword = isStrongNikamPassword;
}

if (typeof module !== "undefined") {
  module.exports = {
    NIKAM_BUSES,
    findNikamBus
  };
}
