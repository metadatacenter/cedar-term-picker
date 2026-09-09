export interface ControlledTermVersionRef {
  id: string;
  effectiveDate?: string;
  declaredVersion?: string;
}

export interface ControlledTermConfig {
  sourceType: 'ontology-term' | 'ontology' | 'value-set' | 'ontology-branch';
  /** Model identities are independent of the display acronym. */
  uri?: string;
  iri?: string;
  sourceSystem?: string;
  source?: string;
  label?: string;
  termType?: 'OntologyClass' | 'Value';
  numTerms?: number | null;
  sourceId?: string;
  sourceName?: string;
  ontologyId?: string;
  ontologyName?: string;
  branchRootId?: string;
  branchRootName?: string;
  searchDepth?: number;
  /**
   * The snapshot the author pinned, where they pinned one. Absent means the
   * latest the terminology server serves, resolved when the template is read.
   */
  version?: ControlledTermVersionRef;
}

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
