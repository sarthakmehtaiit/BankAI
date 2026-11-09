// Edit distance (Levenshtein): the minimum number of single-letter inserts, deletes
// or replacements that turn `a` into `b`. Classic dynamic programming, O(n * m).
//   editDistance('MEHTA', 'METHA') = 2
export function editDistance(a, b) {
  // prev[j] = edit distance between the first (i - 1) letters of a and the first j letters of b
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // delete a letter
        curr[j - 1] + 1, // insert a letter
        prev[j - 1] + cost, // replace (or keep) a letter
      );
    }
    prev = curr; // only the previous row is needed, so memory is O(m)
  }
  return prev[b.length];
}

// "  Priya   nair " -> "PRIYA NAIR"
export function normalizeName(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 1 = identical, 0 = completely different
export function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}
