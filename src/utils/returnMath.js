// Mirrors the server's refund rule (backend/models/return.model.js): refund
// what the customer actually paid for the line (after promo/bargain/bill
// discount), and the last units returned get whatever's left so partial
// returns never add up to more than was paid.
const round2 = (n) => Math.round(n * 100) / 100;

export const remainingQty = (item) => item.quantity - (item.already_returned || 0);

export const paidPerUnit = (item) => Number(item.line_total) / item.quantity;

export const refundFor = (item, qty) => {
  if (!qty) return 0;
  return qty === remainingQty(item)
    ? round2(Number(item.line_total) - Number(item.already_refunded || 0))
    : round2(paidPerUnit(item) * qty);
};
