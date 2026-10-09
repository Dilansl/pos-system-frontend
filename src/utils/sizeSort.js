// Orders variants the way a shop assistant reads them: product name, then
// size (XS < S < M < L < XL…, numbers numerically, kids' ages "2Y" < "4Y"),
// then colour.
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'];

const sizeRank = (size) => {
  const s = String(size || '').trim().toUpperCase();
  const letter = LETTER_SIZES.indexOf(s);
  if (letter !== -1) return [0, letter];
  const num = parseFloat(s);
  if (!Number.isNaN(num)) return [1, num];
  return [2, s];
};

export const compareVariants = (a, b) => {
  const byName = String(a.product_name).localeCompare(String(b.product_name));
  if (byName) return byName;
  const [ga, va] = sizeRank(a.size);
  const [gb, vb] = sizeRank(b.size);
  if (ga !== gb) return ga - gb;
  if (va !== vb) return typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
  return String(a.color || '').localeCompare(String(b.color || ''));
};
