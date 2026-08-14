/**
 * The `POST /search` contract, as the terminology server serves it.
 *
 * Keys are the versioned value-constraint specification's, which is the point of them: a hit is a
 * constraint entry plus the evidence for choosing it, so what the picker hands back needs no
 * translation. The design is in `cedar-development/ops/VERSION-AWARE-SEARCH.md`.
 */

/** The four kinds a controlled-term field can be constrained to. */
export const SEARCH_KINDS = ['ontology', 'branch', 'class', 'valueSet'] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

/** What the tab strip shows, in the order it shows them. */
export const TAB_ORDER: readonly SearchKind[] = ['class', 'branch', 'ontology', 'valueSet'];

export const TAB_LABELS: Readonly<Record<SearchKind, string>> = {
  class: 'terms',
  branch: 'branches',
  ontology: 'ontologies',
  valueSet: 'value sets',
};

export interface VersionSelector {
  readonly id: string;
}

export interface SourceSelector {
  readonly sourceSystem?: string;
  readonly sourceAcronym: string;
  readonly version?: VersionSelector | 'latest';
}

export interface SearchQuery {
  readonly query: string;
  readonly types?: readonly SearchKind[];
  readonly sources?: readonly SourceSelector[];
  readonly lang?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface VersionInfo {
  readonly id?: string;
  readonly effectiveDate?: string;
  readonly declaredVersion?: string;
}

/** How one source answered, said once rather than repeated on every hit from it. */
export interface SourceBlock {
  readonly sourceSystem: string;
  readonly sourceAcronym: string;
  readonly sourceName?: string;
  readonly sourceIri?: string;
  readonly served: 'local' | 'proxied' | 'unavailable';
  readonly pinnable: boolean;
  readonly version?: VersionInfo;
  readonly reason?: string;
}

export interface MatchedLabel {
  readonly label: string;
  readonly language?: string;
}

export interface TermRef {
  readonly termIri: string;
  readonly termLabel?: string;
}

interface HitBase {
  readonly sourceSystem: string;
  readonly sourceAcronym: string;
  readonly matchType?: string;
  readonly matchedLabels?: readonly MatchedLabel[];
}

export interface ClassHit extends HitBase {
  readonly type: 'class';
  readonly termIri: string;
  readonly termType: string;
  readonly termLabel: string;
  readonly obsolete: boolean;
  readonly replacedBy?: TermRef;
  readonly hasChildren: boolean;
  readonly descendantCount: number;
}

export interface BranchHit extends HitBase {
  readonly type: 'branch';
  readonly termBaseIri: string;
  readonly termBaseLabel: string;
  readonly descendantCount: number;
  readonly obsolete: boolean;
  readonly path?: readonly TermRef[];
  readonly examples?: readonly TermRef[];
}

export interface OntologyHit extends HitBase {
  readonly type: 'ontology';
  readonly termCount?: number;
  readonly matchCount?: number;
}

export interface ValueSetHit extends HitBase {
  readonly type: 'valueSet';
  readonly termBaseIri: string;
  readonly termBaseLabel?: string;
  readonly termCount?: number;
  readonly matchedTerms?: readonly TermRef[];
}

/**
 * A hit, discriminated by `type` — a union rather than one shape with optional everything, so a
 * row that reads `termBaseIri` cannot be handed a class.
 */
export type Hit = ClassHit | BranchHit | OntologyHit | ValueSetHit;

export interface TypeResults {
  readonly totalCount: number;
  readonly countCapped: boolean;
  /** Rows once identical labels are folded together. Present for the terms results only. */
  readonly distinctLabelCount?: number;
  readonly distinctLabelCountCapped?: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly collection: readonly Hit[];
}

export interface SearchResponse {
  readonly query: string;
  readonly sources: readonly SourceBlock[];
  readonly results: Partial<Record<SearchKind, TypeResults>>;
}

/** What the server says when it will not answer, as opposed to answering with nothing. */
export interface SearchError {
  readonly errorKey?: string;
  readonly errorMessage?: string;
}

export function isClassHit(hit: Hit): hit is ClassHit {
  return hit.type === 'class';
}

export function isBranchHit(hit: Hit): hit is BranchHit {
  return hit.type === 'branch';
}

export function isOntologyHit(hit: Hit): hit is OntologyHit {
  return hit.type === 'ontology';
}

export function isValueSetHit(hit: Hit): hit is ValueSetHit {
  return hit.type === 'valueSet';
}
