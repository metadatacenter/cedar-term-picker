import { expect, test } from '@playwright/test';
import {
  branchHit,
  classHit,
  ontologyHit,
  openPicker,
  results,
  search,
  source,
  stubSearch,
} from './support';

/**
 * What the picker does with an answer.
 *
 * Each of these is a failure that was found by hand and by nothing else. They are written as the
 * question an author would ask — can I tell these two rows apart, does the count mean what it says
 * — rather than as assertions about markup, so a rewrite of the markup that keeps the behaviour
 * keeps them passing.
 */

const MELANOMA = {
  sources: [
    source('NCIT', { name: 'National Cancer Institute Thesaurus', versionCount: 3, declaredVersion: '26.07d' }),
    source('DOID', { name: 'Human Disease Ontology', versionCount: 15, declaredVersion: '2026-06-30' }),
    source('OCHV', { name: 'Ontology of Consumer Health Vocabulary', versionCount: 1 }),
    source('GONE', { served: 'unavailable', reason: 'sourceUnknown' }),
  ],
  results: {
    class: results(
      [
        classHit('NCIT', 'Melanoma', { descendantCount: 321 }),
        classHit('DOID', 'melanoma', { descendantCount: 31 }),
        classHit('OCHV', '6188', { matched: { label: 'HIV disease', language: 'en' } }),
      ],
      { totalCount: 5439, distinctLabelCount: 2552 },
    ),
    branch: results(
      [
        branchHit('RH-MESH', 'Melanoma', 'Neuroendocrine Tumors', 13),
        branchHit('RH-MESH', 'Melanoma', 'Nevi and Melanomas', 13),
        branchHit('NCIT', 'Melanoma', 'Melanocytic Neoplasm', 321),
      ],
      { totalCount: 3, distinctLabelCount: 1 },
    ),
    ontology: results([ontologyHit('MELO', 38, true), ontologyHit('NCIT', 950, false)]),
    valueSet: results([]),
  },
};

test('a tab counts what the author will see, not what matched', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');

  // 2,552 labels, not 5,439 hits: the hit count saturates on every query worth typing.
  await expect(page.locator('cedar-term-picker .tab').first()).toContainText('2,552');
  await expect(page.locator('cedar-term-picker .tab').first()).not.toContainText('5,439');
});

test('identical labels fold into one row, counting the ontologies that offer it', async ({ page }) => {
  await stubSearch(page, () => ({
    ...MELANOMA,
    results: {
      ...MELANOMA.results,
      class: results(
        [classHit('NCIT', 'Melanoma'), classHit('DOID', 'Melanoma'), classHit('OCHV', 'Distinct')],
        { totalCount: 3, distinctLabelCount: 2 },
      ),
    },
  }));
  await openPicker(page);
  await search(page, 'melanoma');

  const rows = page.locator('cedar-term-picker .rowhead');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('in 2 ontologies');

  // The ontologies are inside, where an author can tell them apart and choose one.
  await rows.first().click();
  await expect(page.locator('cedar-term-picker .child')).toHaveCount(2);
  await expect(page.locator('cedar-term-picker .child').first()).toContainText('NCIT');
});

test('a row whose label is a bare code leads with the name that matched', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');

  // OCHV labels a concept 6188 and keeps "HIV disease" as a synonym. 6188 is not a name.
  const coded = page.locator('cedar-term-picker .rowhead', { hasText: '6188' });
  await expect(coded).toContainText('HIV disease');
  await expect(coded.locator('.title')).toHaveText('HIV disease');
});

test('branches fold across and within ontologies, and open onto their parents', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .tab').nth(1).click();

  // Three positions in two ontologies, folded to one row: RH-MESH places one concept twice.
  const row = page.locator('cedar-term-picker .rowhead');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('in 2 ontologies');
  await expect(row).toContainText('3 positions');

  await row.click();
  const children = page.locator('cedar-term-picker .child');
  await expect(children).toHaveCount(3);
  // The parent is the only thing telling two RH-MESH rows apart.
  await expect(children.nth(0)).toContainText('Neuroendocrine Tumors');
  await expect(children.nth(1)).toContainText('Nevi and Melanomas');
});

test('an ontology row says whether it is named for the query or holds its terms', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .tab').nth(2).click();

  const rows = page.locator('cedar-term-picker .row.oneline');
  await expect(rows.filter({ hasText: 'MELO' })).toContainText('named');
  await expect(rows.filter({ hasText: 'NCIT' })).toContainText('950 terms inside');
  await expect(rows.filter({ hasText: 'NCIT' })).not.toContainText('named');
});

test('every result row is one line', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');

  // A branch row once set its descendant count at heading scale and stood three times as tall as
  // its neighbours. The invariant is one line each, not identical heights: a row carrying a chip is
  // legitimately a few pixels taller than one that does not.
  const termRow = await page.locator('cedar-term-picker .rowhead').first().boundingBox();
  await page.locator('cedar-term-picker .tab').nth(1).click();
  await expect(page.locator('cedar-term-picker .rowhead')).toHaveCount(1);
  const branchRow = await page.locator('cedar-term-picker .rowhead').boundingBox();
  await page.locator('cedar-term-picker .tab').nth(2).click();
  const ontologyRow = await page.locator('cedar-term-picker .row.oneline').first().boundingBox();

  // One line is about 26px at CEDAR's 14px body; a row carrying buttons runs a few pixels taller.
  // Measured 2026-08-14: terms 26, branches 26, ontologies 31.
  const heights = [termRow!.height, branchRow!.height, ontologyRow!.height];
  for (const height of heights) {
    expect(height).toBeLessThan(36);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(8);
});

test('a source that could not be searched is announced, not silently absent', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');

  // Its absence would otherwise read as the ontology having no matches.
  await expect(page.locator('cedar-term-picker .notice')).toContainText('GONE');
  await expect(page.locator('cedar-term-picker .notice')).toContainText('sourceUnknown');
});

test('a long label folds from the middle, keeping both ends', async ({ page }) => {
  const long =
    'Have you been diagnosed with melanoma in the past - skin cancer, arising in melanocytes, ' +
    'skin cells that make skin pigment:Find:Pt:^Patient:Ord:PhenX';
  await stubSearch(page, () => ({
    ...MELANOMA,
    results: { ...MELANOMA.results, class: results([classHit('LOINC', long)], { distinctLabelCount: 1 }) },
  }));
  await openPicker(page);
  await search(page, 'melanoma');

  const title = page.locator('cedar-term-picker .rowhead .title');
  // The axis codes at the end say what kind of thing it is; cutting the end throws them away.
  await expect(title).toContainText('Have you been diagnosed');
  await expect(title).toContainText(':Find:Pt:^Patient:Ord:PhenX');
  await expect(title).toHaveAttribute('title', long);
});

test('narrowing ranks by matching terms and survives being used', async ({ page }) => {
  const recorded = await stubSearch(page, (body) =>
    body.ontologyOrder === 'matches'
      ? {
          sources: [
            source('NCIT', { name: 'National Cancer Institute Thesaurus' }),
            source('BERO', { name: 'Biological and Environmental Research Ontology' }),
          ],
          results: { ontology: results([ontologyHit('NCIT', 950, false), ontologyHit('BERO', 782, false)]) },
        }
      : MELANOMA,
  );
  await openPicker(page);
  await search(page, 'melanoma');

  await page.locator('cedar-term-picker .narrowing button', { hasText: 'Narrow to' }).click();
  const candidates = page.locator('cedar-term-picker .candidate');
  // Ranked by what each holds, not by its name: NCIT with 950 before BERO with 782.
  await expect(candidates.first()).toContainText('NCIT');
  await expect(candidates.first()).toContainText('950');

  await candidates.first().click();
  await expect(page.locator('cedar-term-picker .chip.removable')).toContainText('NCIT');
  // Choosing re-runs the search, which once cleared the list the author was choosing from.
  await expect(candidates).toHaveCount(2);

  const narrowed = recorded.bodies.at(-1) as { sources?: { sourceAcronym: string }[] };
  expect(narrowed.sources).toEqual([{ sourceAcronym: 'NCIT' }]);
});

test('paging asks for one type and keeps the ontologies it learns', async ({ page }) => {
  const recorded = await stubSearch(page, (body) =>
    body.page === 2
      ? {
          sources: [source('LATER', { name: 'An Ontology From Page Two' })],
          results: {
            class: results([classHit('LATER', 'Intraocular melanoma')], {
              totalCount: 5439,
              distinctLabelCount: 2552,
              page: 2,
            }),
          },
        }
      : MELANOMA,
  );
  await openPicker(page);
  await search(page, 'melanoma');

  await page.locator('cedar-term-picker .pager button', { hasText: 'Next' }).click();
  await expect(
    page.locator('cedar-term-picker .rowhead', { hasText: 'Intraocular melanoma' }),
  ).toBeVisible();

  const asked = recorded.bodies.at(-1) as { types?: string[]; page?: number };
  expect(asked.types).toEqual(['class']);
  expect(asked.page).toBe(2);

  // A row reads its ontology's name from the envelope, and page two names one page one did not.
  await page.locator('cedar-term-picker .rowhead').first().click();
  await expect(page.locator('cedar-term-picker .child').first()).toContainText('An Ontology From Page Two');
});

test('stepping to an older release pins it, and stepping back to current does not', async ({ page }) => {
  await stubSearch(page, (body) =>
    body.includeVersions
      ? {
          sources: [
            source('NCIT', {
              name: 'National Cancer Institute Thesaurus',
              versionCount: 3,
              declaredVersion: '26.07d',
              versions: [
                { id: 'hash-c', declaredVersion: '26.07d' },
                { id: 'hash-b', declaredVersion: '26.06e' },
                { id: 'hash-a', declaredVersion: '26.05d' },
              ],
            }),
          ],
          results: { ontology: results([]) },
        }
      : MELANOMA,
  );
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .tab').nth(1).click();
  // The branch results fold to one row; waiting for that is what says the tab has rendered.
  await expect(page.locator('cedar-term-picker .rowhead')).toHaveCount(1);
  await page.locator('cedar-term-picker .rowhead').click();

  const chosen: unknown[] = [];
  await page.exposeFunction('recordChoice', (constraint: unknown) => chosen.push(constraint));
  await page.evaluate(() =>
    document
      .querySelector('cedar-term-picker')!
      .addEventListener('selected', (event) =>
        (window as unknown as { recordChoice: (c: unknown) => void }).recordChoice(
          (event as CustomEvent).detail,
        ),
      ),
  );

  const ncit = page.locator('cedar-term-picker .child', { hasText: 'NCIT' });
  await ncit.locator('.step').first().click();
  await expect(ncit.locator('.version')).toHaveText('v26.06e');

  await ncit.locator('button', { hasText: 'Use' }).click();
  expect((chosen[0] as { version?: { declaredVersion: string } }).version?.declaredVersion).toBe('26.06e');

  // Forward to current unpins: latest keeps meaning latest until publishing resolves it.
  await ncit.locator('.step').nth(1).click();
  await expect(ncit.locator('.version')).toHaveText('v26.07d');
  await ncit.locator('button', { hasText: 'Use' }).click();
  expect((chosen[1] as { version?: unknown }).version).toBeUndefined();
});
