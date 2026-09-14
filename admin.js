function adminToken() {
  return localStorage.getItem("nikamAdminToken") || "";
}

async function login(event) {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const error = document.getElementById("error");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Invalid admin username or password.");
    }

    localStorage.setItem("nikamAdminToken", result.token);
    localStorage.setItem("adminLogged", "true");
    window.location.href = "admin-dashboard.html";
  } catch (err) {
    error.textContent = err.message || "Invalid admin username or password.";
  }
}

function logout() {
  localStorage.removeItem("adminLogged");
  localStorage.removeItem("nikamAdminToken");
  window.location.href = "admin-login.html";
}

function requireAdminPage() {
  if (location.pathname.endsWith("admin-login.html")) return true;
  if (localStorage.getItem("adminLogged") !== "true" || !adminToken()) {
    window.location.replace("admin-login.html");
    return false;
  }
  return true;
}

async function adminFetch(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${adminToken()}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) logout();
    throw new Error(data?.message || "Admin request failed.");
  }
  return data;
}

async function loadDashboardStats() {
  const grid = document.getElementById("dashboardStats");
  if (!grid) return;

  try {
    const result = await adminFetch("/api/admin/stats");
    const stats = result.stats;
    const cards = [
      ["Total Users", stats.totalUsers],
      ["Total Bookings", stats.totalBookings],
      ["Confirmed Bookings", stats.confirmedBookings],
      ["Pending Bookings", stats.pendingBookings],
      ["Cancelled Bookings", stats.cancelledBookings],
      ["Total Revenue", `Rs.${stats.totalRevenue}`],
      ["Today's Bookings", stats.todaysBookings]
    ];
    grid.innerHTML = cards.map(([label, value]) => `<div class="card"><h4>${label}</h4><p class="admin-stat">${value}</p></div>`).join("");
  } catch (err) {
    grid.innerHTML = `<div class="card"><h4>Error</h4><p>${escapeAdminHtml(err.message)}</p></div>`;
  }
}

async function loadBookings() {
  const table = document.getElementById("bookingTable");
  if (!table) return;

  try {
    const bookings = await adminFetch("/api/admin/bookings");
    table.innerHTML = "";

    if (!bookings.length) {
      table.innerHTML = "<tr><td colspan='12'>No bookings found</td></tr>";
      return;
    }

    bookings.forEach((b) => {
      const seats = Array.isArray(b.seats) ? b.seats.join(", ") : "-";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeAdminHtml(b.bookingId || b.id)}</td>
        <td>${escapeAdminHtml(b.passengerName || b.name || "-")}</td>
        <td>${escapeAdminHtml(b.mobile || "-")}</td>
        <td>${escapeAdminHtml(b.busName || "-")}</td>
        <td>${escapeAdminHtml(b.busNumber || "-")}</td>
        <td>${escapeAdminHtml(b.from || "-")}</td>
        <td>${escapeAdminHtml(b.to || "-")}</td>
        <td>${escapeAdminHtml(b.travelDate || "-")}</td>
        <td>${escapeAdminHtml(seats)}</td>
        <td>Rs.${escapeAdminHtml(b.totalAmount || 0)}</td>
        <td>${escapeAdminHtml(b.paymentStatus || "-")}</td>
        <td>${escapeAdminHtml(b.bookingStatus || "-")}</td>
      `;
      table.appendChild(row);
    });
  } catch (err) {
    table.innerHTML = `<tr><td colspan='12'>${escapeAdminHtml(err.message || "Error loading bookings")}</td></tr>`;
  }
}

async function loadUsers() {
  const table = document.getElementById("userTable");
  if (!table) return;

  try {
    const result = await adminFetch("/api/admin/users");
    table.innerHTML = "";

    if (!result.users.length) {
      table.innerHTML = "<tr><td colspan='6'>No users found</td></tr>";
      return;
    }

    result.users.forEach((u) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeAdminHtml(u.name)}</td>
        <td>${escapeAdminHtml(u.email)}</td>
        <td>${escapeAdminHtml(u.mobile)}</td>
        <td>${escapeAdminHtml(u.registeredAt ? u.registeredAt.slice(0, 10) : "-")}</td>
        <td>${escapeAdminHtml(u.bookingCount || 0)}</td>
        <td>${escapeAdminHtml(u.status || "ACTIVE")}</td>
      `;
      table.appendChild(row);
    });
  } catch (err) {
    table.innerHTML = `<tr><td colspan='6'>${escapeAdminHtml(err.message || "Error loading users")}</td></tr>`;
  }
}

function loadBusManagement() {
  const busTable = document.getElementById("busTable");
  if (!busTable || typeof NIKAM_BUSES === "undefined") return;
  busTable.innerHTML = NIKAM_BUSES.map((bus) => `
    <tr>
      <td>${escapeAdminHtml(bus.name)}</td>
      <td>${escapeAdminHtml(bus.busNumber)}</td>
      <td>${escapeAdminHtml(bus.from)} -> ${escapeAdminHtml(bus.to)}</td>
      <td>${escapeAdminHtml(bus.departureTime)} -> ${escapeAdminHtml(bus.arrivalTime)}</td>
      <td>${escapeAdminHtml(bus.distance)}</td>
      <td>${escapeAdminHtml(bus.type)}</td>
      <td>${escapeAdminHtml(bus.seatType)}</td>
      <td>Rs.${escapeAdminHtml(bus.price)}</td>
      <td>${escapeAdminHtml(bus.active === false ? "Inactive" : "Active")}</td>
    </tr>
  `).join("");
}

function escapeAdminHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAdminPage()) return;
  loadDashboardStats();
  loadBookings();
  loadUsers();
  loadBusManagement();
});
