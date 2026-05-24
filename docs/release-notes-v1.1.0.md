---
version: "1.1.0"
released: "2026-05-25"
lang: en
tags: [release-notes, bid-othello, multiplayer]
---

# Bid Othello v1.1.0 — Multiplayer Update

## Summary

Bid Othello v1.1.0 introduces human-vs-human play: a same-device **hotseat**
mode and an **online multiplayer** mode that connects two players over
WebSocket using shareable room codes. This release marks a deliberate pivot
from "NPC-first" to "human-vs-human-first" play, while keeping the existing
solo-vs-AI experience intact for practice.

If v1.0 was about proving the bidding rule works at all, v1.1 is about making
it a game you can play with another person — across the table or across the
internet.

## Highlights (User-facing)

- **Hotseat mode (pass-and-play)** — Two players share one device. A handoff
  overlay hides each player's bid from the other before reveal, so the
  bidding tension survives even on the same screen.
- **Online multiplayer (room codes)** — Create a room, share a short code,
  and play remotely over WebSocket. Includes reconnect-on-disconnect with a
  short grace period, so a flaky connection doesn't immediately kill a game.
- **Preset chat (8 phrases)** — A small, fixed set of in-match phrases
  ("Good luck", "Nice move", "Sorry, lag", etc.) replaces free-text chat.
  Keeps online play friendly without inviting abuse.
- **English title "Bid Othello"** — The app is now formally titled
  *Bid Othello* in English (formerly *Bidding Othello* / *ビッド式オセロ*).
  The `appTitle` i18n key is unified across both locales.
- **NPC mode preserved** — All of v1.0's solo-vs-AI play is still here,
  including the Oni difficulty. Treat it as a training mode rather than the
  main event (see Known Issues, below).

## Known Issues

### T15: Alternating-bid exploit against the Oni AI (NPC mode only)

Against the **Oni** difficulty level in NPC mode, a player can win reliably
by alternating bids of "50% of remaining chips → 0 → 50% → 0 → ..." from
move 1 onward. This exploit is reproducible on production builds even after
the intended fix shipped.

**Status.** A detection routine (`detectOpponentBidStrategy`, classifying
opponent behavior as `conservative` / `panic` / `aggressive`) is present in
the codebase and is exercised by unit tests, but in real play the Oni does
not de-escalate as designed in this specific 50/0/50/0 pattern. The root
cause is still under investigation; current hypotheses include early-game
sample-size gating (the detector defaults to `aggressive` when fewer than
three opponent bids have been observed) and a defensive bid-floor that may
override the conservative response.

**Workaround.** None for users who want a fair fight against the Oni in NPC
mode. We recommend playing hotseat or online matches against a human, which
is the focus of this release.

**Plan.** With the pivot toward human-vs-human play, hardening the Oni AI is
now a medium-term effort rather than a launch blocker. We will track this
publicly on the issue tracker:
[github.com/.../issues — T15 alternating-bid exploit (TBD)](https://github.com/).

This is documented honestly here because we'd rather ship multiplayer than
delay it for an AI patch — and because solo players deserve to know what
they're walking into. Background on the bidding-game family: see
[Bidding chess on Wikipedia](https://en.wikipedia.org/wiki/Bidding_chess).

## Internal Changes (Developer-facing)

- **WebSocket protocol** — `src/net/protocol.ts` defines the wire format
  (JOIN / CREATE_ROOM / BID / PLACE / RESIGN / REMATCH / CHAT / PING). Bid
  values are masked as `'HIDDEN'` in spectator and pre-reveal views.
- **Client** — `src/net/partyClient.ts` handles connection, room lifecycle,
  rejoin-after-disconnect, and PING/PONG keep-alive.
- **Server** — `server/index.ts` is a single-file Node + `ws` server (port
  8787 locally) wrapped in an HTTP layer so platform health checks pass.
- **Lobby UI** — `src/ui/OnlineLobby.tsx` is lazy-loaded via
  `React.Suspense` so the online module does not bloat the initial bundle
  for offline-only sessions.
- **Feature flag** — `VITE_ONLINE_ENABLED` gates the Online tab so the
  client can ship before the WebSocket host is provisioned in any given
  environment.
- **Deployment infra** — `render.yaml` (Render free tier, with HTTP health
  check), `fly.toml`, and `Dockerfile` are included for the WebSocket server.
  The Vite/Vercel deployment for the web client is unchanged.
- **Build/scripts** — `npm run server` runs the WS server; `npm run start`
  runs web + server concurrently via `concurrently`.

## Breaking Changes

**None for end users.** The existing vs-AI flow and any bookmarked URLs
continue to work as in v1.0. New game modes are additive and reachable from
the lobby tab.

For self-hosters, the WebSocket server is a new optional process. If it is
not deployed (or `VITE_ONLINE_ENABLED` is unset), the Online tab is hidden
and the rest of the app behaves exactly as v1.0.

## Acknowledgements

Bid Othello stands on the shoulders of earlier bidding-game work. We
gratefully acknowledge:

- **Bidding chess** (Richman / "Richman chess"), catalogued at
  [chessvariants.com](https://www.chessvariants.com/diffmove.dir/bidding-chess.html)
  and on [Wikipedia](https://en.wikipedia.org/wiki/Bidding_chess), as the
  original demonstration that "buy the right to move" is a viable game
  mechanic.
- **Bufón** (boardgame, [BGG entry](https://boardgamegeek.com/boardgame/)),
  for showing that bidding-for-turn-order generalizes beyond chess.
- The wider abstract-strategy community for keeping these mechanics alive.

Our contribution is small: porting bidding to Othello, tuning chip economy
for a roughly 30-move game, and packaging it as a web/PWA that two people
can pick up in under a minute.

## Commit Range

`5b79c0f..39bd09c` — 6 commits on `main`, merged 2026-05-25.

```
0889de8 feat(net): WebSocket multiplayer core (protocol/partyClient/OnlineLobby/server)
e6c07e9 feat(ui): App.tsx hotseat + online modes (Mode union x4) + i18n appTitle "Bid Othello"
f0f40ff feat(ui): chat pinned to preset phrases (free-text removed)
d595008 chore(meta): English title "Bid Othello" + .env.example
95d6e2d chore(deploy): fly.toml and Dockerfile (deploy not yet executed)
39bd09c chore(deploy): Render Free tier support (health check + render.yaml)
```
