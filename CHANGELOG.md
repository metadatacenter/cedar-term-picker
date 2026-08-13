# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing released yet.

### Added

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
