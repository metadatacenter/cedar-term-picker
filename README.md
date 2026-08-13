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
belongs; the [CEDAR Embeddable Editor](https://github.com/metadatacenter/cedar-embeddable-editor)
covers metadata viewing and entry and does its own value lookup when a form is
filled.

It reads from the CEDAR terminology server, which serves ontologies, classes
and value sets either from the versioned local store or from BioPortal. The
component is published as a custom element, `<cedar-term-picker>`, rendered in
shadow DOM so a host page's stylesheet cannot reach inside it.

## Status

Scaffolded, not built. The Angular 22 project stands up, the gate is green, and
the element registers and exchanges an input and an event with its host — but
the component itself renders a search box and four tab names over no search at
all. Nothing reads from the terminology server yet.

Planned work, and the decisions already taken, are tracked in
[TERM-PICKER-ROADMAP.md](https://github.com/metadatacenter/cedar-development/blob/develop/ops/TERM-PICKER-ROADMAP.md).

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

| Command | What it does |
|---|---|
| `npm run build:production` | the custom-element bundle, into `dist/cedar-term-picker` |
| `npm test` | unit tests, through the Angular CLI's Vitest builder |
| `npm run lint` | ESLint over TypeScript and templates, Prettier included |
| `npm run typecheck` | `tsc` over every file under `src/` |
| `npm run test:ci` | the gate: lint, typecheck, tests, then the production build |
| `npm run audit:prod` | advisories against what actually ships |

GitHub Actions runs the gate on push and pull request. The build is zoneless, so
change detection runs on signals rather than on `zone.js` patching the browser's
async APIs: a view updates on a microtask after a signal is set, and
`await fixture.whenStable()` is what a spec waits on.

Fuller development notes are in
[TERM-PICKER-RUNBOOK.md](https://github.com/metadatacenter/cedar-development/blob/develop/ops/TERM-PICKER-RUNBOOK.md).

## Browser Support

The component requires native Custom Elements v1 and native Shadow DOM, and
supports the browser targets of the Angular version each release is built with.
It does not polyfill its host page.

## License

BSD 2-Clause, in [license.txt](license.txt).
