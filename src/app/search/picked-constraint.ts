/**
 * What `<cedar-term-picker>` emits, and what the designer stores for it.
 *
 * The picker is a sibling web component rather than a dependency: a host page
 * loads both scripts and neither bundles the other. That is what two custom
 * elements are, and it is why the shape below is declared here rather than
 * imported — the picker's package is not installed, and CED reads four fields of
 * a much larger object.
 *
 * Structural, so it is checked against what actually arrives rather than assumed:
 * the mapper narrows on `type` and reads nothing a hit of that type lacks.
 */

/** The tag the host is expected to have registered. */
export const TERM_PICKER_TAG = 'cedar-term-picker';

/**
 * The snapshot an author pinned, where they pinned one.
 *
 * `id` is the snapshot's content hash and the only part resolution reads; the
 * other two are labels for people. The picker also reports whether a later
 * extraction of the same source bytes exists, which is a thing to say while
 * choosing rather than a thing to store — a pin written before one was superseded
 * still resolves, because a published template has to keep meaning what it meant.
 */
export interface PickedVersion {
  readonly id?: string;
  readonly effectiveDate?: string;
  readonly declaredVersion?: string;
  readonly superseded?: boolean;
}

interface HitBase {
  readonly type: string;
  readonly sourceAcronym: string;
  readonly sourceSystem?: string;
  readonly sourceIri?: string;
  readonly sourceName?: string;
  readonly version?: PickedVersion;
}

export interface PickedClass extends HitBase {
  readonly type: 'class';
  readonly termType?: string;
  readonly termIri: string;
  readonly termLabel: string;
}

export interface PickedBranch extends HitBase {
  readonly type: 'branch';
  readonly termBaseIri: string;
  readonly termBaseLabel: string;
}

export interface PickedOntology extends HitBase {
  readonly type: 'ontology';
}

export interface PickedValueSet extends HitBase {
  readonly type: 'valueSet';
  readonly termBaseIri: string;
  readonly termBaseLabel?: string;
}

export type PickedConstraint = PickedClass | PickedBranch | PickedOntology | PickedValueSet;

import { ControlledTermConfig } from './constraint-set';

/**
 * The picker's choice, as the constraint the designer stores.
 *
 * The four kinds the picker searches are the four the designer already models,
 * which is not a coincidence: both are the four things a CEDAR field can be
 * constrained to. What changes is where the values come from — an author used to
 * type an ontology acronym and a branch IRI into free-text boxes from memory, and
 * nothing checked either.
 */
export function toControlledTermConfig(picked: PickedConstraint): ControlledTermConfig {
  /*
   * A version with no `id` names nothing: the hash is what resolution reads, and
   * the other two members are labels. Absent, the constraint resolves against the
   * latest snapshot the terminology server serves — a different statement from
   * naming one, and not a default to invent.
   */
  const version =
    picked.version?.id === undefined
      ? undefined
      : {
          id: picked.version.id,
          effectiveDate: picked.version.effectiveDate,
          declaredVersion: picked.version.declaredVersion,
        };

  /*
   * A name, always. The picker's `sourceName` is optional — a source block can
   * arrive with an acronym and nothing else — and the model library refuses an
   * ontology constraint without one, so building a template from such a pick
   * threw. The acronym is what an author recognises anyway.
   */
  const sourceName = picked.sourceName || picked.sourceAcronym;

  switch (picked.type) {
    case 'class':
      return {
        sourceType: 'ontology-term',
        termType: picked.termType === 'value' ? 'Value' : 'OntologyClass',
        sourceId: picked.termIri,
        sourceName: picked.termLabel,
        ontologyId: picked.sourceAcronym,
        ontologyName: sourceName,
        sourceSystem: picked.sourceSystem,
        iri: picked.sourceIri,
        version,
      };
    case 'branch':
      return {
        sourceType: 'ontology-branch',
        sourceId: picked.sourceAcronym,
        ontologyName: sourceName,
        branchRootId: picked.termBaseIri,
        branchRootName: picked.termBaseLabel,
        searchDepth: 1,
        sourceSystem: picked.sourceSystem,
        iri: picked.sourceIri,
        version,
      };
    case 'ontology':
      return {
        sourceType: 'ontology',
        uri: picked.sourceIri ?? `https://data.bioontology.org/ontologies/${picked.sourceAcronym}`,
        sourceId: picked.sourceAcronym,
        ontologyId: picked.sourceAcronym,
        ontologyName: sourceName,
        sourceSystem: picked.sourceSystem,
        iri: picked.sourceIri,
        version,
      };
    case 'valueSet':
      return {
        sourceType: 'value-set',
        sourceId: picked.termBaseIri,
        sourceName: picked.termBaseLabel,
        ontologyId: picked.sourceAcronym,
        ontologyName: sourceName,
        sourceSystem: picked.sourceSystem,
        iri: picked.sourceIri,
        version,
      };
  }
}
