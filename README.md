# CEDAR Term Picker

A reusable Web Component for choosing what constrains a CEDAR field: an
ontology, a branch of one, an individual term, or a value set.

An author types one search term and sees how many matches each of those four
kinds has, then opens the one they came for. Refining the query updates every
count at once. This inverts the choice the CEDAR Workbench asks for today,
where an author picks a search mode before searching and only then discovers
whether that mode has anything to offer.

The component replaces the controlled-term picker in the Template Designer
(`cedar-template-editor/app/scripts/controlled-term/`), which is its host.
Template authoring is where constraints are written, so that is where the picker
belongs; the CEDAR Embeddable Editor covers metadata viewing and entry and does
its own value lookup when a form is filled.

It reads from the CEDAR terminology server, which serves ontologies, classes
and value sets either from the versioned local store or from BioPortal.

## Status

Design stage. The repository carries its license, conventions and this
statement of intent; no component code has been written yet. Planned work is
tracked in `cedar-development/ops/TERM-PICKER-ROADMAP.md`, and build, test and
release instructions will live alongside it in
`cedar-development/ops/TERM-PICKER-RUNBOOK.md`.
