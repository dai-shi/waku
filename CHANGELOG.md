# Change Log

## [Unreleased]

## [0.21.23] - 2025-03-10

### Changed

- Bug fixes & some updates

## [0.21.22] - 2025-02-28

### Changed

- Bug fixes & some updates
- Router improvement

## [0.21.21] - 2025-02-24

### Changed

- Bug fixes & some updates

## [0.21.20] - 2025-02-17

### Changed

- Bug fixes & some updates
- Router improvement

## [0.21.19] - 2025-02-14

### Changed

- Bug fixes & some updates
- Router improvement

## [0.21.18] - 2025-02-03

### Changed

- Bug fixes & some updates

## [0.21.17] - 2025-01-23

### Changed

- Bug fixes

## [0.21.16] - 2025-01-20

### Changed

- Bug fixes

## [0.21.15] - 2025-01-16

### Changed

- Bug fixes

## [0.21.14] - 2025-01-13

### Changed

- Bug fixes

## [0.21.13] - 2025-01-07

### Changed

- Error handling improvements
- Bug fixes

## [0.21.12] - 2025-01-01

### Changed

- Granular vite configs

## [0.21.11] - 2024-12-28

### Changed

- Vite 6 migration
- Bug fixes

## [0.21.10] - 2024-12-22

### Changed

- Bug fixes

## [0.21.9] - 2024-12-15

### Changed

- Support for progressive enhancement
- Various bug fixes

## [0.21.8] - 2024-12-10

### Changed

- Bug fixes
- React 19

## [0.21.7] - 2024-12-02

### Changed

- Bug fixes
- Small improvements

## [0.21.6] - 2024-11-10

### Changed

- Switch from Cloudflare Pages to Workers

## [0.21.5] - 2024-10-21

### Changed

- Bug fixes

## [0.21.4] - 2024-10-18

### Changed

- Router improvements

## [0.21.3] - 2024-10-04

### Changed

- Router typing support
- Various improvements

## [0.21.2] - 2024-09-13

### Changed

- Bug fixes

## [0.21.1] - 2024-08-29

### Changed

- Minor improvements

## [0.21.0] - 2024-08-20

### Added

- Server actions support
- Various improvements
- Cloudflare pages support (experimental)

## [0.20.2] - 2024-05-13

### Changed

- Better SSG support
- Fix various bugs

## [0.20.1] - 2024-04-17

### Changed

- Fix invalid AsyncLocalStorage warning

### Added

- Support .js and .jsx extensions

## [0.20.0] - 2024-03-26

### Added

- Middleware architecture
- File system router / managed mode
- New router API

### Changed

- getContext / rerender from 'waku/server'
- SSR by default (opting out method)

## [0.19.4] - 2024-02-27

### Changed

- fix various bugs
- support customizing 404

## [0.19.3] - 2024-02-14

### Changed

- fix SSR (html generation) build
- support RSC hot reload in DEV
- better Netlify support

## [0.19.2] - 2024-02-06

### Changed

- fix various bugs
- support deployment on netlify and aws-lambda

## [0.19.1] - 2024-01-22

### Changed

- fix some issues with deployment
- improve style HMR in development

## [0.19.0] - 2024-01-16

### Added

- breaking: no index html #289
- fix(vercel): option for static build #310
- feat(router): createPages #293
- feat: environment variables #321

## [0.18.1] - 2023-12-15

### Changed

- improve vercel deploy script
- improve css handling

## [0.18.0] - 2023-12-12

### Changed

- switch to hono from express (still depends on node) #165
- fix: build error on windows #174
- feat: build rsc so that react-server condition is unnecessary #204
- feat: separate dev and prd apis #233

## [0.17.1] - 2023-11-27

### Changed

- fix: ssr and bundling #176
- fix: support common component that can be used both in RSC and RCC #180
- fix: build error on windows #174

## [0.17.0] - 2023-11-14

### Added

- breaking: switch to full SSR from RSC-only SSR #147

### Changed

- fix: support node 20 #159
- rename rscPrefix to rscPath #160

## [0.16.0] - 2023-10-25

### Changed

- feat(router): slug support #133
- feat: upgrade to vite 4.5.0 #141

## [0.15.1] - 2023-09-12

### Changed

- fix(waku/client): CJS import hack #130
- fix: prefetch default hack #131

## [0.15.0] - 2023-09-11

### Changed

- breaking: multiple elements in a single response #124

## [0.14.0] - 2023-07-28

### Changed

- fix: partially for css modules #98
- feat: use node-loader again #103
- fix: hacks for windows filesystem #108
- feat: css modules #106

## [0.13.0] - 2023-07-06

### Changed

- breaking: src and dist folders at the same level #92

### Added

- feat: server context #86

## [0.12.1] - 2023-06-20

### Changed

- fix: ssr with suspense and hydration #78

## [0.12.0] - 2023-06-19

### Changed

- fix: rename getBuilder to getBuildConfig #75

### Added

- feat: support 404 for rsc #76
- feat: ssr middlware #74

## [0.11.3] - 2023-06-10

### Changed

- fix: 'use client' warning #63
- fix: collecting client modules #69
- fix: react-server condition for libraries #71

## [0.11.2] - 2023-06-03

### Changed

- fix(examples): config extension in script #56
- vercel build output api #53

## [0.11.1] - 2023-06-01

### Changed

- fix: rscPrefix config without trailing slash #50
- feat: generalized router #55

## [0.11.0] - 2023-05-25

### Changed

- fix: make getBuilder optional #41

### Added

- feat: Expose as middleware #46

## [0.10.0] - 2023-05-22

### Added

- Initial Waku release
