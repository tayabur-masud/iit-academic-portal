/**
 * The page numbers to show: the first and last page and a window around the current one, with an ellipsis where
 * pages are skipped, for example 1 … 8 9 [10] 11 12 … 40.
 */
export function pageList(current: number, total: number, around = 2): (number | '…')[] {
  if (total <= 1) {
    return total === 1 ? [1] : [];
  }
  const wanted = new Set([1, total]);
  for (let n = current - around; n <= current + around; n++) {
    if (n >= 1 && n <= total) {
      wanted.add(n);
    }
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | '…')[] = [];
  sorted.forEach((n, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && n - previous === 2) {
      result.push(previous + 1); // a single skipped page is shown, not hidden behind an ellipsis
    } else if (previous !== undefined && n - previous > 2) {
      result.push('…');
    }
    result.push(n);
  });
  return result;
}
