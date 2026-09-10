/**
 * What the published constraint contract forbids.
 *
 * `ControlledTermConfig` is re-exported from `term-picker-public-api.ts`, so its shape
 * is what an embedding page programs against. It was one interface with fifteen
 * optional fields, and a host had no way to learn from the compiler that a branch has
 * no `ontologyId` or that a term has no depth. Narrowing it into four variants is a
 * change to a contract, and a contract's tests are the ones that say what it refuses.
 *
 * `@ts-expect-error` is what makes that checkable: each fails the build if the error it
 * claims stops happening, so this goes red if the union is ever loosened back or if a
 * variant's required field is quietly dropped.
 */
import { describe, expect, it } from 'vitest';
import {
  BranchConstraint,
  ClassConstraint,
  ControlledTermConfig,
  ControlledTermSet,
  OntologyConstraint,
  ValueSetConstraint,
} from './constraint-set';

describe('the published constraint contract', () => {
  it('requires the identifier each kind of constraint is', () => {
    // @ts-expect-error a branch is a root term and its descendants, so the root is not optional
    const branch: BranchConstraint = { sourceType: 'ontology-branch', sourceId: 'DOID' };
    // @ts-expect-error the acronym is an ontology constraint's identity
    const ontology: OntologyConstraint = { sourceType: 'ontology', ontologyName: 'Human Disease Ontology' };
    // @ts-expect-error a term constraint is the term's IRI
    const term: ClassConstraint = { sourceType: 'ontology-term', label: 'melanoma' };
    // @ts-expect-error a value-set constraint is the value set's IRI
    const valueSet: ValueSetConstraint = { sourceType: 'value-set', sourceName: 'A list' };

    expect([branch, ontology, term, valueSet].map((c) => c.sourceType)).toEqual([
      'ontology-branch',
      'ontology',
      'ontology-term',
      'value-set',
    ]);
  });

  /**
   * The confusion this replaces. `sourceId` is the term's IRI on a term, the value
   * set's IRI on a value set, and the ontology's acronym on a branch — so reaching for
   * a field without knowing the kind was reading one of three different things.
   */
  it('will not let one kind be read as another', () => {
    const term: ControlledTermConfig = { sourceType: 'ontology-term', sourceId: 'urn:melanoma' };
    // @ts-expect-error a term has no branch root
    expect(term.branchRootId).toBeUndefined();
    // @ts-expect-error a term has no search depth
    expect(term.searchDepth).toBeUndefined();

    const branch: ControlledTermConfig = { sourceType: 'ontology-branch', branchRootId: 'urn:disease' };
    // @ts-expect-error a branch names its ontology in `sourceId`, and has no `ontologyId`
    expect(branch.ontologyId).toBeUndefined();
  });

  it('reads the fields of whichever variant it has been narrowed to', () => {
    const set: ControlledTermSet = {
      constraints: [
        { sourceType: 'ontology', ontologyId: 'DOID', ontologyName: 'Human Disease Ontology' },
        { sourceType: 'ontology-branch', branchRootId: 'urn:disease', sourceId: 'DOID', searchDepth: 3 },
        { sourceType: 'ontology-term', sourceId: 'urn:melanoma', label: 'melanoma' },
        { sourceType: 'value-set', sourceId: 'urn:list', sourceName: 'A list' },
      ],
      actions: [],
    };

    const depths = set.constraints.flatMap((c) => (c.sourceType === 'ontology-branch' ? [c.searchDepth] : []));
    const acronyms = set.constraints.flatMap((c) => (c.sourceType === 'ontology' ? [c.ontologyId] : []));

    expect(depths).toEqual([3]);
    expect(acronyms).toEqual(['DOID']);
  });

  /**
   * Every key the contract carried before still exists on the variant that used it.
   * Narrowing was meant to say which fields belong where, not to remove any: a host
   * already producing valid constraints keeps compiling.
   */
  it('keeps every key it published, on the kind that used it', () => {
    const constraints: ControlledTermConfig[] = [
      {
        sourceType: 'ontology',
        ontologyId: 'DOID',
        ontologyName: 'Human Disease Ontology',
        uri: 'urn:doid',
        sourceId: 'DOID',
        numTerms: 12,
        iri: 'urn:doid',
        sourceSystem: 'bioportal',
        version: { id: 'hash', effectiveDate: '2026-07-01', declaredVersion: '2026-06-30' },
      },
      {
        sourceType: 'ontology-branch',
        branchRootId: 'urn:disease',
        branchRootName: 'disease',
        sourceId: 'DOID',
        source: 'DOID',
        ontologyName: 'Human Disease Ontology',
        searchDepth: 3,
      },
      {
        sourceType: 'ontology-term',
        sourceId: 'urn:melanoma',
        label: 'melanoma',
        sourceName: 'Melanoma',
        ontologyId: 'DOID',
        ontologyName: 'Human Disease Ontology',
        source: 'DOID',
        termType: 'OntologyClass',
      },
      {
        sourceType: 'value-set',
        sourceId: 'urn:list',
        sourceName: 'A list',
        ontologyId: 'CEDARVS',
        ontologyName: 'CEDAR value sets',
        numTerms: 4,
      },
    ];
    const published = new Set([
      'sourceType',
      'uri',
      'iri',
      'sourceSystem',
      'source',
      'label',
      'termType',
      'numTerms',
      'sourceId',
      'sourceName',
      'ontologyId',
      'ontologyName',
      'branchRootId',
      'branchRootName',
      'searchDepth',
      'version',
    ]);
    const used = new Set(constraints.flatMap((c) => Object.keys(c)));

    expect([...used].filter((key) => !published.has(key))).toEqual([]);
    expect([...published].filter((key) => !used.has(key))).toEqual([]);
  });
});
