# Change Log

## [Unreleased]

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
