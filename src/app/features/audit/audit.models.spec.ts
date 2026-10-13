import { pageList } from './audit.models';

describe('pageList', () => {
  it('lists every page when there are few', () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is empty when there are no pages', () => {
    expect(pageList(1, 0)).toEqual([]);
  });

  it('keeps the first and last page and a window around the current one', () => {
    expect(pageList(1, 40)).toEqual([1, 2, 3, '…', 40]);
    expect(pageList(10, 40)).toEqual([1, '…', 8, 9, 10, 11, 12, '…', 40]);
    expect(pageList(40, 40)).toEqual([1, '…', 38, 39, 40]);
  });

  it('shows a single skipped page instead of an ellipsis', () => {
    expect(pageList(5, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pageList(6, 9)).toEqual([1, '…', 4, 5, 6, 7, 8, 9]);
    expect(pageList(4, 9)).toEqual([1, 2, 3, 4, 5, 6, '…', 9]);
  });
});
