# Nikam Travel - Online Bus Booking System

Nikam Travel is a full-stack bus booking demonstration project for MCA submission. It uses an Express backend, static HTML/CSS/JavaScript frontend, JSON-backed demo persistence, deterministic seat availability, customer authentication, admin reports, and Razorpay Test order verification.

## Features

- Customer registration and login with validated name, age, mobile, email, and password.
- Protected booking pages and customer APIs.
- Route search for demo Maharashtra routes from Chhatrapati Sambhajinagar.
- Unique bus data with bus number, timing, route, distance, type, seat layout, amenities, and price.
- Deterministic seat availability by bus number and journey date.
- Multi-seat selection with server-side price validation.
- Razorpay Test order creation and server-side signature verification.
- Demo payment mode for college walkthroughs when real Razorpay Test keys are unavailable.
- Booking confirmation, printable ticket, download, WhatsApp share, and My Bookings.
- Admin login, dashboard statistics, bookings view, users view, and bus route view.

## Technology Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Payment: Razorpay Test Checkout
- Persistence: JSON files for college/demo mode
- Tests: Node test runner

## Project Structure

- `server.js` - Express API, auth, payment, booking, admin, and file persistence.
- `data.js` - Shared demo bus dataset and browser helpers.
- `index.html`, `route.html`, `seat.html`, `booking-confirmation.html`, `mybookings.html` - Customer booking flow.
- `admin-login.html`, `admin-dashboard.html`, `admin-bookings.html`, `admin-manage-bus.html` - Admin flow.
- `style.css`, `admin.css` - Customer and admin styling.
- `tests/` - Payment and booking validation tests.
- `.env.example` - Required environment variable template.
- `vercel.json` - Vercel routing for the Express app.

## Local Setup

```bash
npm install
copy .env.example .env
npm start
```

Open `http://localhost:3000`.

## Environment Variables

```env
PORT=3000
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_your_test_key_id_here
RAZORPAY_KEY_SECRET=your_test_key_secret_here
DEMO_PAYMENT=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_for_local_demo
CLIENT_URL=http://localhost:3000
```

Use real Razorpay Test keys for Razorpay Checkout. For a classroom demo without Razorpay credentials, set `DEMO_PAYMENT=true`; the backend still validates the booking amount and seats before confirming the demo payment.

## Demo Flow

1. Register a customer with a valid Indian mobile number.
2. Login using mobile and password.
3. Search routes and select a future journey date.
4. Choose a bus and seats.
5. Confirm passenger details.
6. Complete Razorpay Test Checkout or demo payment.
7. View the booking confirmation and ticket.
8. Open My Bookings to verify the ticket is saved.
9. Login to Admin and verify dashboard/bookings/users.

## Tests

```bash
npm run check
npm test
```

## Deployment Notes

For Vercel:

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Add all `.env.example` variables in Vercel Project Settings.
4. Set `DEMO_PAYMENT=false` and add real Razorpay Test keys for payment testing.
5. Deploy.

The app is configured as a single Express/static deployment through `vercel.json`.

## Security Notes

- Razorpay secret is only read on the server.
- Booking amount is recalculated on the server from the selected bus price.
- Seat availability is checked again before order creation and before payment verification.
- Customer booking APIs require a login token.
- Admin APIs require a server-issued admin token.
- Passwords are stored as hashes in the demo JSON user store.

## Future Scope

- Replace JSON files with MongoDB collections for production concurrency and persistence.
- Add cancellation/refund workflows.
- Add editable admin bus management backed by a database.
- Add email/SMS ticket delivery.
