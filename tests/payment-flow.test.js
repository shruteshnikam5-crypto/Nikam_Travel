const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeBooking, calculateTotalAmount, calculateAmountInPaise } = require('../server');

test('sanitizeBooking preserves consistent total amount and paise conversion', () => {
  const booking = sanitizeBooking({
    userId: 'USER-9876543210',
    passengerName: 'Test User',
    email: 'test@example.com',
    mobile: '9876543210',
    age: 21,
    busId: 'NT-PN-001',
    travelDate: '2099-09-20',
    seats: ['L1', 'L2'],
    totalAmount: 1598,
  });

  assert.equal(booking.totalAmount, 1598);
  assert.equal(booking.pricePerSeat, 799);
  assert.equal(calculateTotalAmount(booking.seats, booking.pricePerSeat), 1598);
  assert.equal(calculateAmountInPaise(booking.totalAmount), 159800);
});

test('sanitizeBooking rejects mismatched amount values', () => {
  assert.throws(
    () =>
      sanitizeBooking({
        name: 'Test User',
        email: 'test@example.com',
        mobile: '9876543210',
        age: 21,
        busId: 'NT-PN-001',
        travelDate: '2099-09-20',
        seats: ['L1', 'L2'],
        totalAmount: 239,
      }),
    /Amount mismatch/
  );
});
