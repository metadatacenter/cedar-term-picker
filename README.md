# CEDAR Term Picker

[![Test](https://github.com/metadatacenter/cedar-term-picker/actions/workflows/test.yml/badge.svg?branch=develop)](https://github.com/metadatacenter/cedar-term-picker/actions/workflows/test.yml)

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
belongs; the [CEDAR Embeddable Editor](https://github.com/metadatacenter/cedar-embeddable-editor)
covers metadata viewing and entry and does its own value lookup when a form is
filled.

It reads from the CEDAR terminology server, which serves ontologies, classes
and value sets either from the versioned local store or from BioPortal. The
component is published as a custom element, `<cedar-term-picker>`, rendered in
shadow DOM so a host page's stylesheet cannot reach inside it.

## Status

It searches. One query answers all four tabs against the CEDAR terminology
server's version-aware search, folding repeated labels into a row apiece,
ranking ontologies by what they hold, narrowing to the ones an author names,
paging through the rest, and stepping a constraint back through an ontology's
releases.

The embeddable designer uses it for vocabulary constraints and controlled-term
default values. It also runs in its own development host.

Planned work, and the decisions already taken, are tracked with the rest of
versioning in
[VERSIONING-ROADMAP.md](https://github.com/metadatacenter/cedar-development/blob/develop/ops/VERSIONING-ROADMAP.md)
— the picker exists to author versioned constraints, so it has no roadmap of its
own.

## Theming

A host may set these ten custom properties on the element, and they are the whole surface:

```css
cedar-term-picker {
  --ctp-color-primary: #0f7686; /* buttons, the active tab, the focus ring */
  --ctp-color-on-primary: #ffffff; /* text on the primary */
  --ctp-color-heading: #0b3938; /* row titles and labels */
  --ctp-color-text: rgba(0, 0, 0, 0.87);
  --ctp-color-muted: #555555; /* counts, versions, everything supporting */
  --ctp-color-surface: #f5f5f5; /* the panel behind expanded rows */
  --ctp-color-border: #d7e0df;
  --ctp-color-warning: #856404; /* obsolete terms, sources that were not searched */
  --ctp-font-family: 'CEE Roboto', 'Helvetica Neue', sans-serif;
  --ctp-font-size: 14px;
}
```

Rules in a host page take precedence over the component's own, so these are defaults rather than a
floor. Two values are derived and not settable: the type scale moves with `--ctp-font-size`, so a
larger base reads as a larger component rather than a broken one, and the tint behind chips and
pinned versions is mixed from `--ctp-color-primary`, so re-pointing the brand does not leave it
behind.

Nothing else is host API. Row geometry, control padding, the radius of a chip and the meaning of a
colour stay with the component: a host able to re-point them individually could make an obsolete
term look like an ordinary one, which is the failure the contract exists to prevent. The CEDAR
Embeddable Editor reaches the same rule from the other side — its Material internals are not host
API either.

## Requirements

Node 24.19.0, the version `.nvmrc` pins and CI runs. Angular 22 accepts
`^22.22.3 || ^24.15.0 || >=26`; 24 is the active LTS where 22 is in maintenance.
Nothing here needs Java, and nothing needs the CEDAR stack running until the
component starts reading from it.

## Running It

```shell
npm install
npm start
```

This serves a development host on port 4500 — a page standing in for the
Template Designer, which sets the element's `query` attribute and listens for
its `cancelled` event. Nothing on that page ships.

## Building and Testing

| Command                    | What it does                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run build:production` | the custom-element bundle, into `dist/cedar-term-picker`                                       |
| `npm test`                 | unit tests, through the Angular CLI's Vitest builder                                           |
| `npm run lint`             | ESLint over TypeScript and templates, Prettier included                                        |
| `npm run typecheck`        | `tsc` over every file under `src/`                                                             |
| `npm run dist`             | the distribution: one script, its declarations, and a staged package                           |
| `npm run test:ci`          | the gate: lint, typecheck, tests, the production build, the browser tests and the distribution |
| `npm run audit:prod`       | advisories against what actually ships                                                         |

GitHub Actions runs the gate on push and pull request. The build is zoneless, so
change detection runs on signals rather than on `zone.js` patching the browser's
async APIs: a view updates on a microtask after a signal is set, and
`await fixture.whenStable()` is what a spec waits on.

Fuller development notes are in
[VERSIONING-RUNBOOK.md](https://github.com/metadatacenter/cedar-development/blob/develop/ops/VERSIONING-RUNBOOK.md),
which covers running, building and releasing the picker alongside the store it
reads.

## Packaging

```shell
npm run dist
```

Builds the picker, flattens Angular's module output into one classic script with
esbuild, holds it to its size ceiling, and stages
`dist-npm/cedar-term-picker/` from those exact bytes. The staging step builds
nothing of its own — it copies the file the size gate measured — and verifies the
result byte for byte afterwards.

A host loads the script with a plain `<script>` tag and then has
`<cedar-term-picker>`. Properties configure its search and selection mode; two events report selection
and cancellation:

```html
<cedar-term-picker id="picker"></cedar-term-picker>
<script src="cedar-term-picker.js"></script>
<script>
  const picker = document.getElementById('picker');
  picker.terminologyBaseUrl = 'https://terminology.metadatacenter.org/';
  picker.query = 'melanoma';
  picker.addEventListener('selected', (event) => console.log(event.detail));
  picker.addEventListener('cancelled', () => picker.remove());
</script>
```

`terminologyBaseUrl` is what makes the picker embeddable at all. Unset, it asks
its own origin for `/search`, which is what the development server's proxy
answers and what no host page has.

For a default value, set `selectionMode = 'term'`. Only individual terms can be
selected in this mode; ontology, branch and value-set constraint tabs are hidden.
Set `sources = [{ sourceAcronym: 'DOID' }]` to fix the vocabulary scope. Entries
accept the same optional `version` selector as search requests. The default mode
is `'constraint'`, and an empty source list searches all sources. A host using a
term as a field default must also verify it against the field's constraints;
source scoping alone does not enforce branch or value-set membership.

Which registry a package belongs to is derived from its version rather than
passed at publish time: a version carrying `-dev.` names the CEDAR Nexus under
`@org.metadatacenter`, anything else is a release for public npmjs, unscoped. A
snapshot therefore cannot reach npmjs by forgetting a flag.

Nothing has been published on either channel yet.

## Browser Support

The component requires native Custom Elements v1 and native Shadow DOM, and
supports the browser targets of the Angular version each release is built with.
It does not polyfill its host page.

## License

BSD 2-Clause, in [license.txt](license.txt).
