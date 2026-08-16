import { expect, test } from '@playwright/test';
import {
  branchHit,
  classHit,
  ontologyHit,
  openPicker,
  results,
  search,
  source,
  stubHierarchy,
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
    source('NCIT', { name: 'National Cancer Institute Thesaurus', versionCount: 3, declaredVersion: '26.07d', iri: 'http://ncit.example/ncit.owl' }),
    source('DOID', { name: 'Human Disease Ontology', versionCount: 15, declaredVersion: '2026-06-30' }),
    source('OCHV', { name: 'Ontology of Consumer Health Vocabulary', versionCount: 1 }),
    source('MELO', { name: 'Melanoma Ontology' }),
    source('GONE', { served: 'unavailable', reason: 'sourceUnknown' }),
  ],
  results: {
    class: results(
      [
        classHit('NCIT', 'Melanoma', {
          descendantCount: 321,
          under: 'Melanocytic Neoplasm',
          names: [{ label: 'Cutaneous melanoma' }, { label: 'mélanome', language: 'fr' }],
        }),
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

test('a tab does not claim nothing matched while it is still asking', async ({ page }) => {
  // An answer that takes its time is the case this exists for: the empty state is a claim about the
  // answer, and there is no answer yet.
  await stubSearch(page, () => MELANOMA);
  await page.route('**/search', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fallback();
  });
  await openPicker(page);
  await page.locator('cedar-term-picker input').fill('melanoma');

  await expect(page.locator('cedar-term-picker .working')).toBeVisible();
  await expect(page.locator('cedar-term-picker')).not.toContainText('No terms match');
  await expect(page.locator('cedar-term-picker .rowhead').first()).toBeVisible();
});

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

  // Three branches in two ontologies, folded to one row: RH-MESH places one concept twice.
  const row = page.locator('cedar-term-picker .rowhead');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('in 2 ontologies');
  await expect(row).toContainText('3 branches in 2 ontologies');

  await row.click();
  const children = page.locator('cedar-term-picker .child');
  await expect(children).toHaveCount(3);

  // Two of them are RH-MESH placing one concept at two points in its own tree, so those two — and
  // only those two — name the step above them. A row with no twin says nothing about the hierarchy.
  await expect(children.nth(0)).toContainText('under Neuroendocrine Tumors');
  await expect(children.nth(1)).toContainText('under Nevi and Melanomas');
  await expect(children.nth(2)).not.toContainText('under');
  await stubHierarchy(page, (query) => ({
    sourceAcronym: query.get('sourceAcronym'),
    termIri: query.get('termIri'),
    termLabel: 'Melanoma',
    path: [{ termIri: 'http://rh-mesh/parent', termLabel: 'Neuroendocrine Tumors' }],
    childCount: 0,
    descendantCount: 13,
  }));
  await children.nth(0).click();
  await expect(page.locator('cedar-term-picker .tree .node').first()).toContainText(
    'Neuroendocrine Tumors',
  );
});

test('an ontology row shows what the query matched, or nothing but its count', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .tab').nth(2).click();

  // A vocabulary named for the query says so by marking the part of the name that matched. NCIT is
  // here because its terms matched, and its count is the whole of the reason.
  const rows = page.locator('cedar-term-picker .row.oneline');
  await expect(rows.filter({ hasText: 'MELO' }).locator('mark')).toHaveText('Melanoma');
  await expect(rows.filter({ hasText: 'NCIT' })).toContainText('950 terms');
  await expect(rows.filter({ hasText: 'NCIT' }).locator('mark')).toHaveCount(0);
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

test('a host can re-point the contract, and nothing else', async ({ page }) => {
  // Its own fixture: this needs a row carrying a chip, and the only matched label in MELANOMA
  // belongs to the coded row, where the chip is deliberately suppressed.
  await stubSearch(page, () => ({
    ...MELANOMA,
    results: {
      ...MELANOMA.results,
      class: results([classHit('NCIT', 'Melanoma', { matched: { label: 'malignant melanoma', language: 'en' } })], {
        distinctLabelCount: 1,
      }),
    },
  }));
  await openPicker(page);
  await page.addStyleTag({
    content: `cedar-term-picker {
      --ctp-color-primary: rgb(128, 0, 128);
      --ctp-color-text: rgb(17, 17, 17);
      --ctp-font-size: 16px;
    }`,
  });
  await search(page, 'melanoma');

  // Rules in the outer tree beat :host, so the component's values are defaults rather than a floor.
  const picker = page.locator('cedar-term-picker');
  await expect(picker).toHaveCSS('color', 'rgb(17, 17, 17)');
  await expect(picker).toHaveCSS('font-size', '16px');

  // The brand reaches what carries it, and the tint is derived from it rather than left behind.
  await expect(page.locator('cedar-term-picker .tab.active')).toHaveCSS(
    'border-bottom-color',
    'rgb(128, 0, 128)',
  );
  const chip = await page
    .locator('cedar-term-picker .chip')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(chip).not.toBe('rgb(255, 255, 255)');

  // The type scale moves with the base rather than being pinned beside it.
  const small = await page
    .locator('cedar-term-picker .badge')
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
  expect(small).toBe('14px');

  // And what is not in the contract stays out of reach: a host cannot re-point the geometry.
  await page.addStyleTag({ content: 'cedar-term-picker { --ctp-row-padding: 40px; }' });
  const rowHeight = (await page.locator('cedar-term-picker .rowhead').first().boundingBox())!.height;
  expect(rowHeight).toBeLessThan(40);
});

test('escape leaves the picker', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  const cancelled: number[] = [];
  await page.exposeFunction('recordCancel', () => cancelled.push(1));
  await page.evaluate(() =>
    document
      .querySelector('cedar-term-picker')!
      .addEventListener('cancelled', () =>
        (window as unknown as { recordCancel: () => void }).recordCancel(),
      ),
  );
  await page.locator('cedar-term-picker input[type=search]').press('Escape');
  expect(cancelled).toHaveLength(1);
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

test('the bar says what is selected, and nothing before anything is', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await stubHierarchy(page, () => null);
  await openPicker(page);
  await search(page, 'melanoma');

  // Nothing marked, nothing claimed. An empty frame would read as a selection of nothing.
  const chosen = page.locator('cedar-term-picker .chosen');
  await expect(chosen).toBeEmpty();
  // Nothing narrowed: one chip-shaped way in, and no reset for a state there is nothing to reset.
  await expect(page.locator('cedar-term-picker .narrowing .adder')).toHaveText('+ narrow to…');
  await expect(page.locator('cedar-term-picker .narrowing .quiet')).toHaveCount(0);

  await page.locator('cedar-term-picker .tab').nth(2).click();
  await page.locator('cedar-term-picker .row.pick').first().click();
  await expect(chosen).toContainText('Every term in');
  await expect(chosen).toContainText('Melanoma Ontology');
  // A term needs no kind said out loud — the label is the whole of it.
  await expect(chosen).not.toContainText('The term');
  // "latest", not the release latest happens to be: an unpinned constraint records no version and
  // freeze-on-publish resolves it at publish time.
  await expect(chosen).toContainText('latest');

  // The phrase follows the mark, and the kind follows the tab.
  await page.locator('cedar-term-picker .tab').nth(1).click();
  await page.locator('cedar-term-picker .rowhead').click();
  await page.locator('cedar-term-picker .child').first().click();
  await expect(chosen).toContainText('Everything under');
});

test('a term picked from the tree becomes the selection, and the panel stays open', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await stubHierarchy(page, (query) => ({
    sourceAcronym: query.get('sourceAcronym'),
    termIri: query.get('termIri'),
    termLabel: 'Melanoma',
    children: [
      { termIri: 'http://ncit/Amelanotic', termLabel: 'Amelanotic Melanoma', hasChildren: false, descendantCount: 0 },
    ],
    childCount: 1,
    descendantCount: 321,
  }));
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .rowhead').first().click();
  await page.locator('cedar-term-picker .child', { hasText: 'NCIT' }).click();

  const chosen = page.locator('cedar-term-picker .chosen');
  await expect(chosen).toContainText('Melanoma');

  // Clicking a term in the tree selects it, and the tree it was found in stays open.
  const child = page.locator('cedar-term-picker .tree .node', { hasText: 'Amelanotic Melanoma' });
  await child.locator('.term').click();
  await expect(chosen).toContainText('Amelanotic Melanoma');
  await expect(child).toHaveClass(/picked/);
  await expect(page.locator('cedar-term-picker .tree')).toBeVisible();
});

test('a term selected in one release is looked for in the next, and falls back when it is gone', async ({ page }) => {
  const inBoth = 'http://ncit/InBoth';
  const goneLater = 'http://ncit/GoneLater';
  await stubSearch(page, (body) =>
    body.includeVersions
      ? {
          sources: [
            source('NCIT', {
              name: 'National Cancer Institute Thesaurus',
              versionCount: 2,
              declaredVersion: '26.07d',
              versions: [
                { id: 'hash-new', declaredVersion: '26.07d' },
                { id: 'hash-old', declaredVersion: '26.06e' },
              ],
            }),
          ],
          results: { ontology: results([]) },
        }
      : MELANOMA,
  );
  // The older release holds both children; the newer one dropped the second.
  await stubHierarchy(page, (query) => {
    const iri = query.get('termIri');
    const old = query.get('versionId') === 'hash-old';
    if (iri === goneLater && !old) {
      return null;
    }
    if (iri === inBoth || iri === goneLater) {
      return {
        sourceAcronym: 'NCIT',
        termIri: iri,
        termLabel: iri === inBoth ? 'In Both' : 'Gone Later',
        path: [{ termIri: 'http://ncit/Melanoma', termLabel: 'Melanoma' }],
        childCount: 0,
        descendantCount: 0,
      };
    }
    return {
      sourceAcronym: 'NCIT',
      termIri: iri,
      termLabel: 'Melanoma',
      children: old
        ? [
            { termIri: inBoth, termLabel: 'In Both', hasChildren: false, descendantCount: 0 },
            { termIri: goneLater, termLabel: 'Gone Later', hasChildren: false, descendantCount: 0 },
          ]
        : [{ termIri: inBoth, termLabel: 'In Both', hasChildren: false, descendantCount: 0 }],
      childCount: old ? 2 : 1,
      descendantCount: 2,
    };
  });
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .rowhead').first().click();
  const ncit = page.locator('cedar-term-picker .child', { hasText: 'NCIT' });
  await ncit.click();
  await ncit.locator('button.of').click();

  // Step to the older release, where both children exist, and select the one that will vanish.
  await page.locator('cedar-term-picker .release').nth(1).click();
  const chosen = page.locator('cedar-term-picker .chosen');
  await page.locator('cedar-term-picker .tree .node', { hasText: 'Gone Later' }).locator('.term').click();
  await expect(chosen).toContainText('Gone Later');

  // Back to the release that dropped it: the selection falls back to the row's own term.
  await page.locator('cedar-term-picker .release').first().click();
  await expect(chosen).toContainText('Melanoma');
  await expect(chosen).not.toContainText('Gone Later');
});

test('narrowed to one ontology, the terms are drawn where they sit in it', async ({ page }) => {
  const scoped = {
    sources: [source('DOID', { name: 'Human Disease Ontology' })],
    results: {
      class: results(
        [
          classHit('DOID', 'disease'),
          classHit('DOID', 'lung disease'),
          classHit('DOID', 'lower respiratory tract disease'),
        ],
        { totalCount: 3, distinctLabelCount: 3 },
      ),
    },
  };
  // The scoped search returns each hit's whole ancestry, which is what roots the tree.
  const chains: Record<string, { termIri: string; termLabel: string }[]> = {
    'http://doid/disease': [],
    'http://doid/lower%20respiratory%20tract%20disease': [
      { termIri: 'http://doid/disease', termLabel: 'disease' },
    ],
    'http://doid/lung%20disease': [
      { termIri: 'http://doid/disease', termLabel: 'disease' },
      {
        termIri: 'http://doid/lower%20respiratory%20tract%20disease',
        termLabel: 'lower respiratory tract disease',
      },
    ],
  };
  await stubSearch(page, (body) => {
    // The narrowing panel asks for its own ranking; without an answer there is nothing to narrow to.
    if (body.ontologyOrder === 'matches') {
      return {
        sources: [source('DOID', { name: 'Human Disease Ontology' })],
        results: { ontology: results([ontologyHit('DOID', 1569, false)]) },
      };
    }
    if (!body.sources?.length) {
      return MELANOMA;
    }
    const hits = scoped.results.class.collection as { termIri: string }[];
    return {
      ...scoped,
      results: {
        class: {
          ...scoped.results.class,
          collection: hits.map((h) => ({ ...h, path: chains[h.termIri] ?? [] })),
        },
      },
    };
  });
  await openPicker(page);
  await search(page, 'disease');
  await page.locator('cedar-term-picker .row.pick, cedar-term-picker .rowhead').first().click();

  // Narrow through the panel, the way an author would.
  await page.locator('cedar-term-picker .adder').click();
  await page.locator('cedar-term-picker .candidate', { hasText: 'DOID' }).click();

  const nodes = page.locator('cedar-term-picker .tree.scoped .node');
  await expect(nodes).toHaveCount(3);
  // Rooted, and each step indented under the one above rather than listed flat.
  await expect(nodes.nth(0)).toContainText('disease');
  await expect(nodes.nth(1)).toContainText('lower respiratory tract disease');
  await expect(nodes.nth(2)).toContainText('lung disease');
  const depths = await nodes.evaluateAll((els) =>
    els.map((el) => parseFloat(getComputedStyle(el).paddingLeft)),
  );
  expect(depths[0]).toBeLessThan(depths[1]);
  expect(depths[1]).toBeLessThan(depths[2]);
});

test('a marked term shows what it is offering', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await stubHierarchy(page, (query) => ({
    sourceAcronym: query.get('sourceAcronym'),
    termIri: query.get('termIri'),
    termLabel: query.get('termIri') === 'http://ncit/Neoplasm' ? 'Neoplasm' : 'Melanoma',
    path: [
      { termIri: 'http://ncit/Neoplasm', termLabel: 'Neoplasm' },
      { termIri: 'http://ncit/Melanocytic', termLabel: 'Melanocytic Neoplasm' },
    ],
    children: [{ termIri: 'http://ncit/Amelanotic', termLabel: 'Amelanotic Melanoma', hasChildren: false, descendantCount: 0 }],
    childCount: 4,
    descendantCount: 321,
  }));
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .rowhead').first().click();

  const ncit = page.locator('cedar-term-picker .child', { hasText: 'NCIT' });
  await expect(page.locator('cedar-term-picker .detail')).toHaveCount(0);
  await ncit.click();

  const detail = page.locator('cedar-term-picker .detail');
  // The chain above the term and what hangs below it, which is what tells one "Melanoma" from
  // another when the label alone cannot.
  const tree = detail.locator('.tree .node');
  await expect(tree).toHaveText([
    /Neoplasm/,
    /Melanocytic Neoplasm/,
    /Melanoma/,
    /Amelanotic Melanoma/,
  ]);
  await expect(detail.locator('.tree .node.self')).toContainText('Melanoma');

  // An ancestor opens where it stands, showing what else is beside the path rather than replacing
  // the tree with a different one.
  await tree.first().locator('.twist').click();
  await expect(detail.locator('.tree .node')).toContainText([
    /Neoplasm/,
    /Melanocytic Neoplasm/,
    /Melanoma/,
    /Amelanotic Melanoma/,
  ]);
  // The other names it goes by, which is what says whether the concept is the one meant.
  await expect(detail).toContainText('Also called');
  await expect(detail).toContainText('Cutaneous melanoma');

  // Clicking the marked row again closes the panel it opened, which is the only way out of a tree
  // deep enough to fill the list. What was selected stays selected.
  await ncit.click();
  await expect(detail).toHaveCount(0);
  // Collapsing a hierarchy is not unselecting a row: the row stays marked and the bar stays put.
  await expect(ncit).toHaveClass(/marked/);
  await expect(page.locator('cedar-term-picker .chosen')).toContainText('Melanoma');
  await ncit.click();
  await expect(detail).toHaveCount(1);

  // One at a time: marking another row moves the panel with the mark.
  await page.locator('cedar-term-picker .child', { hasText: 'DOID' }).click();
  await expect(detail.locator('.tree .node.self')).toContainText('Melanoma');
  await expect(page.locator('cedar-term-picker .detail')).toHaveCount(1);
});

test('a click marks a row and a second act chooses it', async ({ page }) => {
  await stubSearch(page, () => MELANOMA);
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .tab').nth(2).click();

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

  const rows = page.locator('cedar-term-picker .row.pick');
  await rows.first().click();
  await expect(rows.first()).toHaveClass(/marked/);
  // A click is not a decision. Nothing has been emitted, and marking another row moves the mark.
  expect(chosen).toHaveLength(0);
  await rows.nth(1).click();
  await expect(rows.first()).not.toHaveClass(/marked/);
  await expect(rows.nth(1)).toHaveClass(/marked/);

  await rows.nth(1).dblclick();
  expect(chosen).toHaveLength(1);
  expect((chosen[0] as { sourceAcronym: string }).sourceAcronym).toBe('NCIT');

  // Enter reaches the same decision, because a double click has no keyboard equivalent.
  await rows.first().focus();
  await rows.first().press('Enter');
  expect((chosen[1] as { sourceAcronym: string }).sourceAcronym).toBe('MELO');
});

test('a version that is prose is elided, not laid out', async ({ page }) => {
  // owl:versionInfo is free text. The longest one the catalog holds is 782 characters of prose,
  // and a row that lays it out is a row with no room for anything else.
  const prose =
    'New modular version of the SSN ontology. This ontology was originally developed by the ' +
    'W3C Semantic Sensor Networks Incubator Group and revised for the 2017 Recommendation.';
  await stubSearch(page, () => ({
    sources: [source('SSN', { name: 'Semantic Sensor Network', declaredVersion: prose })],
    results: { ontology: results([ontologyHit('SSN', 12, true)]) },
  }));
  await openPicker(page);
  await search(page, 'sensor');
  await page.locator('cedar-term-picker .tab').nth(2).click();

  const version = page.locator('cedar-term-picker .version');
  await expect(version).toHaveAttribute('title', `Version ${prose}`);
  const shown = (await version.innerText()).trim();
  expect(shown.length).toBeLessThanOrEqual(20);
  expect(shown).toContain('…');

  // The row it sits in stays the height of an ordinary one.
  const rows = page.locator('cedar-term-picker .row');
  const box = await rows.first().boundingBox();
  expect(box!.height).toBeLessThan(48);
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

  await page.locator('cedar-term-picker .narrowing .adder').click();
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

test('the list fills itself, asks for one type, and keeps the ontologies it learns', async ({ page }) => {
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

  // Scrolling asks for more, and a first page too short to scroll asks on its own — otherwise a
  // tab whose page one does not fill the box could never reach page two.
  const arrived = page.locator('cedar-term-picker .rowhead', { hasText: 'Intraocular melanoma' });
  await expect(arrived).toBeVisible();

  // Appended once. The list keeps asking until a page comes back short, and a page appended to
  // itself would be the failure that hides.
  expect(await page.locator('cedar-term-picker .rowhead').count()).toBe(3);
  expect(await arrived.count()).toBe(1);

  const asked = recorded.bodies.at(-1) as { types?: string[]; page?: number };
  expect(asked.types).toEqual(['class']);
  expect(asked.page).toBe(2);

  // A row reads its ontology's name from the envelope, and page two names one page one did not.
  await arrived.click();
  await expect(page.locator('cedar-term-picker .child').first()).toContainText('An Ontology From Page Two');

  // A short page is the end of the list, and the list says so rather than asking again.
  await expect(page.locator('cedar-term-picker .tail')).toContainText('no more matches');
  // And it never claimed to be reading more of a list that did not exist yet.
  await expect(page.locator('cedar-term-picker .tail')).not.toContainText('reading more');
});

test('the release count opens the whole history, and choosing from it pins', async ({ page }) => {
  await stubSearch(page, (body) =>
    body.includeVersions
      ? {
          sources: [
            source('NCIT', {
              name: 'National Cancer Institute Thesaurus',
              versionCount: 3,
              declaredVersion: '26.07d',
              versions: [
                { id: 'hash-c-0123456789abcdef', effectiveDate: '2026-07-01T00:00:00.000-07:00', declaredVersion: '26.07d' },
                { id: 'hash-b-0123456789abcdef', effectiveDate: '2026-06-03T00:00:00.000-07:00', declaredVersion: '26.06e' },
                { id: 'hash-a-0123456789abcdef', effectiveDate: '2026-05-06T00:00:00.000-07:00' },
              ],
            }),
          ],
          results: { ontology: results([]) },
        }
      : MELANOMA,
  );
  // The hierarchy is asked for per release, so the stub answers whichever one is requested.
  await stubHierarchy(page, (query) => ({
    sourceAcronym: query.get('sourceAcronym'),
    termIri: query.get('termIri'),
    termLabel: `Melanoma at ${query.get('versionId') ?? 'latest'}`,
    childCount: 0,
    descendantCount: 0,
  }));
  await openPicker(page);
  await search(page, 'melanoma');
  await page.locator('cedar-term-picker .tab').nth(1).click();
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

  // Mark the row first: the panel belongs to a marked row, and the release list opens beside it.
  await page.locator('cedar-term-picker .child', { hasText: 'NCIT' }).click();
  await page.locator('cedar-term-picker button.of', { hasText: 'of 3' }).click();
  const releases = page.locator('cedar-term-picker .release');
  await expect(releases).toHaveCount(3);

  // Each release says what identifies it to a person and what makes a pin reproducible.
  await expect(releases.first()).toContainText('26.07d');
  await expect(releases.first()).toContainText('2026-07-01');
  await expect(releases.first()).toContainText('hash-c-01234');
  await expect(releases.first()).toContainText('latest');
  // A release with no declared version says so rather than showing a gap.
  await expect(releases.nth(2)).toContainText('no declared version');

  // The row reads the current release until one is chosen, and the panel marks which — a list
  // where none is picked out reads as one nothing has been chosen from.
  await expect(releases.first()).toHaveClass(/on/);
  await expect(releases.nth(1)).not.toHaveClass(/on/);
  await releases.nth(1).click();
  await expect(releases.nth(1)).toHaveClass(/on/);
  // A pinned selection states all three of what it records: version, date and content hash.
  const bar = page.locator('cedar-term-picker .chosen');
  await expect(bar).toContainText('26.06e');
  await expect(bar).toContainText('2026-06-03');
  await expect(bar).toContainText('hash-b-01234');
  // The tree is of a release, so stepping to another one reads it again rather than waiting for a
  // read that was never started.
  // Read again at the release chosen, rather than waiting on a read that was never started.
  await expect(page.locator('cedar-term-picker .tree .node.self')).toContainText(
    'Melanoma at hash-b-0123456789abcdef',
  );
  await expect(
    page.locator('cedar-term-picker .child', { hasText: 'NCIT' }).locator('.version'),
  ).toHaveText('26.06e');

  const ncit = page.locator('cedar-term-picker .child', { hasText: 'NCIT' });
  await ncit.dblclick();
  expect((chosen[0] as { version?: { id: string } }).version?.id).toBe('hash-b-0123456789abcdef');

  // Choosing latest again writes nothing: freeze-on-publish resolves an unpinned constraint at
  // publish time, and pinning today's version would silently take that away.
  await releases.first().click();
  await expect(ncit.locator('.version')).toHaveText('26.07d');
  await ncit.dblclick();
  expect((chosen[1] as { version?: unknown }).version).toBeUndefined();
});

