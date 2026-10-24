export const formatRupees = (value: number): string => {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100).toString();
  const grouped = whole.length <= 3
    ? whole
    : `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${whole.slice(-3)}`;
  const fraction = cents % 100;
  return `${value < 0 ? "−" : ""}₹${grouped}${fraction ? "." + String(fraction).padStart(2, "0") : ""}`;
};
