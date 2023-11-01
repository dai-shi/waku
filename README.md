# Waku

Minimalistic React Framework

## Project status

We are working toward v1-alpha: https://github.com/dai-shi/waku/issues/24

Feel free to try it _seriously_ with non-production projects and give us feedback.

Playground: https://codesandbox.io/p/sandbox/waku-example-counter-mdc1yb

## Why develop a React framework?

We believe that React Server Components (RSCs) are the future of React.
The challenge is that we can't utilize RSCs with the React library alone.
Instead, they require a React framework for bundling, at the very least.

Currently, only a few React frameworks support RSCs, and
they often come with more features than RSCs.
It would be nice to have a minimal framework that implements RSCs,
which should help learning how RSCs work.

Learning is the start, but it's not what we aim at.
Our assumption is that RSC best practices are still to explore.
The minimal implementation should clarify the fundamentals of RSCs
and enable the creation of additional features.
Our goal is to establish an ecosystem that covers a broader range of use cases.

## How to create a new project

Minimum requirement: Node.js 18

```bash
npm create waku@latest
```

```bash
yarn create waku
```

```bash
pnpm create waku # It may not work correctly with some libs
```

## APIs

TODO

## Tweets

<details>

- https://twitter.com/dai_shi/status/1631668890861441024
- https://twitter.com/dai_shi/status/1631989295866347520
- https://twitter.com/dai_shi/status/1632005473401716736
- https://twitter.com/dai_shi/status/1632168346354593792
- https://twitter.com/dai_shi/status/1632729614450823169
- https://twitter.com/dai_shi/status/1632749501416087552
- https://twitter.com/dai_shi/status/1633262538862530561
- https://twitter.com/dai_shi/status/1633301007391424518
- https://twitter.com/dai_shi/status/1633821215206035460
- https://twitter.com/dai_shi/status/1633824588152074240
- https://twitter.com/dai_shi/status/1633826855282434048
- https://twitter.com/dai_shi/status/1634210639831867392
- https://twitter.com/dai_shi/status/1634212827706654723
- https://twitter.com/dai_shi/status/1635142924928434177
- https://twitter.com/dai_shi/status/1635149324383559681
- https://twitter.com/dai_shi/status/1635437958185766913
- https://twitter.com/dai_shi/status/1636744180902014981
- https://twitter.com/dai_shi/status/1636745339624624132
- https://twitter.com/dai_shi/status/1636746632900534273
- https://twitter.com/dai_shi/status/1637635196458778627
- https://twitter.com/dai_shi/status/1637768216817840129
- https://twitter.com/dai_shi/status/1638910110448902145
- https://twitter.com/dai_shi/status/1639858260114300931
- https://twitter.com/dai_shi/status/1640358907540537344
- https://twitter.com/dai_shi/status/1642463300314333184
- https://twitter.com/dai_shi/status/1643224085755998210
- https://twitter.com/dai_shi/status/1647132330543419392
- https://twitter.com/dai_shi/status/1654755487391559680
- https://twitter.com/dai_shi/status/1660306318140542976
- https://twitter.com/dai_shi/status/1660537733201248257
- https://twitter.com/dai_shi/status/1660660331528728578
- https://twitter.com/dai_shi/status/1661727138746339328
- https://twitter.com/dai_shi/status/1664286329763684353
- https://twitter.com/dai_shi/status/1664989534889861123
- https://twitter.com/dai_shi/status/1667545252654366721
- https://twitter.com/dai_shi/status/1670650381762961408
- https://twitter.com/dai_shi/status/1671161795061628930
- https://twitter.com/dai_shi/status/1676793637282394112
- https://twitter.com/dai_shi/status/1684928419220578304
- https://twitter.com/dai_shi/status/1701220824412528721
- https://twitter.com/dai_shi/status/1701518886972293289
- https://twitter.com/dai_shi/status/1717018915539492971

</details>

## Diagrams

### Architecture

https://excalidraw.com/#json=XGEA5V5JVU3AZSri7fXOw,Q95v26_30v05jwwQeU_tjw

![waku-arch](https://github.com/dai-shi/waku/assets/490574/482c60ba-3a92-45ba-b7cc-9a077110ce44)

### How React Server Functions Work

https://excalidraw.com/#json=sqAZKA6csX-vLDlnu7CyK,JYQiZyAHbCPK4zPgeD2a8g

![waku-rsf](https://github.com/dai-shi/waku/assets/490574/22874733-20ff-4096-8702-e1fe1166dfd2)

### How Waku counter example communicates with server

https://excalidraw.com/#json=LMrRnVfDm8TDGtP-BfHZ5,o1fI7c_HvL81TDKSRoEc5A

![waku-counter](https://github.com/dai-shi/waku/assets/490574/ca5685c6-a5b2-434a-89bd-272c0d87e935)

### Waku's minimal spec for React Server Components

https://excalidraw.com/#json=RPBX88sLf6FFCQXOVXIyW,ngpz5ZqKyQyU2vgWx_x6tg

![waku-spec](https://github.com/dai-shi/waku/assets/490574/0dd50285-c443-4668-a7d6-fbd6952b0d76)

### How Waku's RSC-only SSR works

https://excalidraw.com/#json=pSsBQOqkYX4O-TIgxNrZj,i_CsymP1VZiHIAa0dlLbNw

![waku-ssr](https://github.com/dai-shi/waku/assets/490574/84629e46-518a-4ab1-946a-8a31c80db879)

### Waku v0.15.0 Protocol

https://excalidraw.com/#json=8muYAv1EfRMXi_If8h1Qn,ZDIumwmVrekMQqCTHLNJyg

![waku-protocol](https://github.com/dai-shi/waku/assets/490574/6fac50e3-7890-447b-ac90-8aa7d6f1ac1b)
