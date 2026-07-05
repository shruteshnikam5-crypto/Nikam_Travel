// ===== LOGIN =====
function login(event) {
  event.preventDefault();

  let u = document.getElementById("username").value;
  let p = document.getElementById("password").value;

  if (u === "admin" && p === "1234") {
    localStorage.setItem("adminLogged", "true");
    window.location.href = "admin-dashboard.html";
  } else {
    document.getElementById("error").innerText =
      "Invalid Username or Password";
  }
}

// ===== LOGOUT =====
function logout() {
  localStorage.removeItem("adminLogged");
  window.location.href = "admin-login.html";
}

// ===== LOAD BOOKINGS FROM BACKEND =====
async function loadBookings() {

  const table = document.getElementById("bookingTable");
  if (!table) return;

  try {

    const response = await fetch("/api/admin/bookings");

    if (!response.ok) {
      throw new Error("Server Error");
    }

    const bookings = await response.json();

    table.innerHTML = "";

    if (bookings.length === 0) {
      table.innerHTML =
        "<tr><td colspan='6'>No bookings found</td></tr>";
      return;
    }

    bookings.forEach(b => {
      table.innerHTML += `
        <tr>
          <td>${b.name}</td>
          <td>${b.email}</td>
          <td>${b.busNumber}</td>
          <td>${b.seats.join(", ")}</td>
          <td>₹${b.totalAmount}</td>
          <td>${b.travelDate}</td>
        </tr>
      `;
    });

  } catch (err) {
    console.error(err);
    table.innerHTML =
      "<tr><td colspan='6'>Error loading bookings ❌</td></tr>";
  }
}

// Auto load when page opens
document.addEventListener("DOMContentLoaded", loadBookings);