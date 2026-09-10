export interface ControlledTermVersionRef {
  id: string;
  effectiveDate?: string;
  declaredVersion?: string;
}

/**
 * A vocabulary constraint, as one of the four things it can actually be.
 *
 * This was one interface with fifteen optional fields, which made every field look
 * readable on every kind of constraint and left the compiler nothing to say about it.
 * The picker's own code showed what that costs: a label was chosen by
 * `branchRootName || sourceName || ontologyName || sourceId || ontologyId`, five
 * fallbacks standing in for a question nobody had written down.
 *
 * The names are kept exactly, because this is a published contract that hosts program
 * against and that crosses to the element as `constraintSet`. What changed is that each
 * variant now declares only its own fields, and the field a constraint cannot exist
 * without is required.
 *
 * The shared names are the reason this matters. `sourceId` is the term's IRI on a term,
 * the value set's IRI on a value set, and the *ontology's acronym* on a branch — three
 * meanings on one key, previously indistinguishable to a reader and to a compiler.
 */
interface ControlledTermCommon {
  /** The source's own IRI, as distinct from the acronym an author recognises. */
  iri?: string;
  sourceSystem?: string;
  /**
   * The snapshot the author pinned, where they pinned one. Absent means the
   * latest the terminology server serves, resolved when the template is read.
   */
  version?: ControlledTermVersionRef;
}

/** Every term in one ontology. */
export interface OntologyConstraint extends ControlledTermCommon {
  sourceType: 'ontology';
  /** The ontology's acronym, which is its identity here. */
  ontologyId: string;
  ontologyName?: string;
  /** The ontology's URI, derived from the acronym when a source does not give one. */
  uri?: string;
  /** The acronym again, as a search hit carries it. */
  sourceId?: string;
  numTerms?: number | null;
}

/** Every term under one root, to a chosen depth. */
export interface BranchConstraint extends ControlledTermCommon {
  sourceType: 'ontology-branch';
  /** The branch root's IRI. The branch is this term and its descendants. */
  branchRootId: string;
  branchRootName?: string;
  /** The acronym of the ontology the branch is drawn from — not the branch's own IRI. */
  sourceId?: string;
  source?: string;
  ontologyName?: string;
  searchDepth?: number;
}

/** One term, named exactly. */
export interface ClassConstraint extends ControlledTermCommon {
  sourceType: 'ontology-term';
  /** The term's IRI. */
  sourceId: string;
  /** The term's label, and the preferred label the source gives it. */
  label?: string;
  sourceName?: string;
  /** The ontology the term is drawn from. */
  ontologyId?: string;
  ontologyName?: string;
  source?: string;
  termType?: 'OntologyClass' | 'Value';
}

/** A curated list of values, which CEDAR treats as its own kind of source. */
export interface ValueSetConstraint extends ControlledTermCommon {
  sourceType: 'value-set';
  /** The value set's IRI. */
  sourceId: string;
  sourceName?: string;
  /** The collection the value set belongs to. */
  ontologyId?: string;
  ontologyName?: string;
  numTerms?: number | null;
}

export type ControlledTermConfig = OntologyConstraint | BranchConstraint | ClassConstraint | ValueSetConstraint;

export interface ControlledTermAction {
  action: string;
  termUri: string;
  sourceUri: string;
  source: string;
  type: 'OntologyClass' | 'Value';
  to?: number;
}

export interface ControlledTermSet {
  constraints: ControlledTermConfig[];
  actions: ControlledTermAction[];
}
