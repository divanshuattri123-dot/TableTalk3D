export const formatRupees = (value: number): string => {
  const whole = Math.trunc(Math.abs(value)).toString();
  const grouped = whole.length <= 3
    ? whole
    : `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${whole.slice(-3)}`;
  return `${value < 0 ? "−" : ""}₹${grouped}`;
};
