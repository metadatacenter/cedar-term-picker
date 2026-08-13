import { TestBed } from '@angular/core/testing';
import { SEARCH_KINDS, TermPicker } from './term-picker';

describe('TermPicker', () => {
  it('seeds what the author sees from the query the host set', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    fixture.componentRef.setInput('query', 'melanoma');
    await fixture.whenStable();

    const input = fixture.nativeElement.shadowRoot.querySelector('input');
    expect(input.value).toBe('melanoma');
  });

  it('names all four kinds a query answers', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    await fixture.whenStable();

    const tabs = [...fixture.nativeElement.shadowRoot.querySelectorAll('.tab')].map((tab: Element) =>
      tab.textContent?.trim(),
    );
    expect(tabs).toEqual([...SEARCH_KINDS]);
  });

  it('tells the host when the author closes without choosing', async () => {
    const fixture = TestBed.createComponent(TermPicker);
    await fixture.whenStable();

    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    fixture.nativeElement.shadowRoot.querySelector('button').click();

    expect(cancelled).toBe(1);
  });
});
