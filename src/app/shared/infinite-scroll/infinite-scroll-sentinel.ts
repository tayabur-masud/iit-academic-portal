import { DestroyRef, Directive, ElementRef, EventEmitter, Output } from '@angular/core';

/** Emits when the observed sentinel approaches the end of the main scroll region. */
@Directive({ selector: '[appInfiniteScrollSentinel]' })
export class InfiniteScrollSentinel {
  @Output() readonly reachedEnd = new EventEmitter<void>();

  private readonly observer?: IntersectionObserver;

  constructor(element: ElementRef<HTMLElement>, destroyRef: DestroyRef) {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.reachedEnd.emit();
        }
      },
      { root: element.nativeElement.closest('main'), rootMargin: '160px 0px' },
    );
    this.observer.observe(element.nativeElement);
    destroyRef.onDestroy(() => this.observer?.disconnect());
  }
}