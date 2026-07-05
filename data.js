// ===== ADMIN LOGIN =====
const ADMIN = {
  username: "admin",
  password: "1234"
};

// ===== BUS DATA =====
let buses = JSON.parse(localStorage.getItem("buses")) || [
  {
    id: 1,
    name: "Nikam Travel",
    from: "Nagpur",
    to: "Pune",
    lowerPrice: 699,
    upperPrice: 599,
    lowerSeats: Array(20).fill("available"),
    upperSeats: Array(20).fill("available")
  }
];

// ===== BOOKINGS DATA =====
let bookings = JSON.parse(localStorage.getItem("bookings")) || [];

function saveData() {
  localStorage.setItem("buses", JSON.stringify(buses));
  localStorage.setItem("bookings", JSON.stringify(bookings));
}
