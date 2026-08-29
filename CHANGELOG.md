# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing released yet.

### Added

- A distribution. `npm run dist` flattens the build into one classic script with
  esbuild, holds it to a recorded size ceiling raw and gzipped, and stages an npm
  package from those exact bytes, verified afterwards byte for byte. Which registry
  a package belongs to is derived from its version, so a development snapshot
  cannot reach npmjs by forgetting a flag.
- `terminologyBaseUrl`, which is what makes the picker embeddable off the
  terminology server's own origin. Unset, it asks its own origin for `/search`,
  which the development server's proxy answers and no host page does.
- The published type declarations, emitted from `term-picker-public-api.ts` and the
  one import-free file it re-exports, so every path a host's compiler follows is
  inside the package.
- The Angular 22 project: a zoneless application registering `<cedar-term-picker>`
  as a custom element in shadow DOM, with ESLint, Prettier, the Angular CLI's Vitest
  builder and a GitHub Actions gate.
- A placeholder component carrying the element boundary and nothing else — a `query`
  input, a `cancelled` output, a search box and the four tab names, over no search.
- CEDAR's design values, copied from the CEDAR Embeddable Editor: the type scale and
  brand palettes in `_cee-tokens.scss`, and Roboto at three weights embedded as font
  faces. A `FontRegistrar` component registers them in the document, because browsers
  ignore `@font-face` declared inside a shadow root.
- `_cedar-neutrals.scss`, the surfaces, borders and text colours CEE renders but does
  not collect into a palette, gathered here with each value's source recorded.

### Changed

- The package is publishable: `private: true` is gone, the version is a dated
  development snapshot, and the licence the repository already carried is declared.
  Nothing has been published on either channel yet.
- The compiler checks the declarations in `node_modules` rather than trusting them,
  and keeps Angular's class-field semantics — `skipLibCheck` off and
  `useDefineForClassFields: false`, both of which the CEDAR Embeddable Editor holds.
  Neither produced an error, which is the only time either is cheap to adopt.

### Fixed

- Naming the element in `HTMLElementTagNameMap` made Angular resolve that interface
  as the host element type when checking the component's own host bindings, so
  without an `HTMLElementEventMap` overload the narrowest match for `keydown` became
  the catch-all, `$event` collapsed to `Event`, and the production build failed on
  the Escape handler.
