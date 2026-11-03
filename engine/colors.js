// Named palette: rules and modules refer to message and effect colours by these indices.
export const COLORS = {
  0: '#000000', 1: '#3a3a3a', 2: '#5a5a5a', 3: '#808080', 4: '#b0b0b0', 5: '#e8e2d4',
  6: '#4a3320', 7: '#8a6238', 8: '#c49a60', 9: '#f0cf62', 10: '#7a1c14', 11: '#ff6a4d',
  12: '#2f5a33', 13: '#7fd468', 14: '#26477f', 15: '#7cc8f2',
};
export function colorRgb(i) {
  const hex = COLORS[i] ?? COLORS[5];
  return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
}
