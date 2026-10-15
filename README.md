# ReleaseShield & AI Notary

**Web content notarization and a dependency release gate, built on GenLayer.**

ReleaseShield & AI Notary is a web app that puts two deployed GenLayer Intelligent Contracts into one verification workflow: notarize what a web page really says, and gate a software release on validator-verified npm package metadata with an optimistic challenge window.

> Network: GenLayer **Bradbury Testnet**. The contracts are already deployed and are **not modified** by this repository.

## The trust problem

- *Did that page really say it?* Audit reports, terms, prices and public statements change or disappear, and screenshots prove nothing.
- *Is this release safe to authorize?* Deploy pipelines and grant programs rely on a human or a centralized script to say "the dependency looks fine".

Here GenLayer validators fetch the web themselves, reach consensus with the Equivalence Principle, and the result is recorded on-chain.

## Contracts

| Contract | Address | Explorer | Source |
|---|---|---|---|
| AI Notary | `0x70751232Dcc5296d1180E86BDF51373f5b72759B` | [view](https://explorer-bradbury.genlayer.com/address/0x70751232Dcc5296d1180E86BDF51373f5b72759B) | [ai-notary-genlayer](https://github.com/MIKI4222/ai-notary-genlayer) |
| Dependency Release Gate | `0xC0CEa82374C4F1bcE296FCDF6818F10A1a20a1aA` | [view](https://explorer-bradbury.genlayer.com/address/0xC0CEa82374C4F1bcE296FCDF6818F10A1a20a1aA) | [genlayer-dependency-release-gate](https://github.com/MIKI4222/genlayer-dependency-release-gate) |

- **AI Notary** — `notarize(url, claim)` renders the page, an LLM judges whether the claim is supported, validators agree on the verdict (`confirmed` / `not_confirmed`), and an append-only record is stored.
- **Dependency Release Gate** — a state machine `READY → OPEN → FINALIZED → CLAIMED` (or `CHALLENGED`, `INELIGIBLE`). Validators fetch npm metadata and check a fixed policy; an eligible result opens a challenge period; after it, `finalize_eligibility` and a one-time public `claim_authorization` record the authorization. It moves no funds.

## How the app uses them

| Page | Route | What it does |
|---|---|---|
| Dashboard | `/` | Live gate status, cycle counters, notarized-record stats and the latest documents |
| AI Web Notary | `/notary` | Submit URL + claim, lifecycle visualizer, searchable registry with verdict filter, lookup by ID (`get_record`), browser-computed SHA-256 fingerprints, raw records |
| Release Gate | `/release-gate` | Live state with deadline countdown, **Evaluate Dependencies & Unlock Release**, challenge, finalize, claim, owner controls |
| Audit | `/audit` | Live gate state, all notary records with raw consensus output, local transaction log with explorer links |

**Cross-contract flow:** notarize an audit report or advisory page → if it contradicts an open release proposal, open it from the record with *Use as release-gate challenge evidence* → `challenge_eligibility` blocks finalization until the owner reopens the cycle.

### Transaction lifecycle

Writes are signed with MetaMask / any EVM wallet through `genlayer-js`. The UI polls the **real** consensus status of the transaction and maps it to `Broadcasting Transaction` → `Waiting for Consensus` → `Executing AI Reasoning` → `Success / Reverted` (the raw status, e.g. `PROPOSING` or `ACCEPTED`, is shown beneath; page-specific labels such as *Fetching Web Page* are used on the notary and gate pages). Raw transactions are stored for audit.

## Limits (by the contracts' design)

- The Release Gate is a **single, npm-focused gate**, not a generic multi-gate registry. Only the owner can change the package source (`set_package_source`), the expected package name and the challenge period; policy checks are fixed. Challenge evidence is a URL that blocks finalization; it is not adjudicated by the contract.
- The gate has **no getters** for its owner, configured package source or period (defaults: `axios`, 30 s) and stores only the current cycle. The README of the contract mentions `get_claim_label`, but the source does not define it, so the app does not call it.
- AI Notary stores no timestamp or hash. The fingerprint shown in the UI is a SHA-256 of the exact stored record, computed in your browser.
- Notary verification uses a renderer that does not wait for client-side JavaScript: prefer static or server-rendered pages.
- Owner-only calls revert for other wallets, and `claim_authorization` is public and one-time.
- The local transaction log lives in your browser's `localStorage`.

## Tests

```bash
npm test      # tsx --test tests/*.test.ts
```

`tests/mock-chain.ts` models both contracts and rejects any call that does not match the real signatures in `tests/signatures.ts` (unknown method, wrong argument count, view/write mix-up, value on a non-payable method). `tests/workflows.test.ts` runs the app's real `src/lib/api.ts` through:

1. **Notary workflow:** notarize, read records, verdicts, lookup by ID, fingerprints, client-side validation.
2. **Gate workflow:** configure, evaluate, early finalize blocked, wait out the challenge period, finalize, claim, owner reset.
3. **Challenge and rejection paths:** challenge blocks finalization, owner reopens, ineligible package is rejected, source change.

Further tests check that read errors surface instead of becoming empty data and that every contract method used in `src/` exists in the signature table (and vice versa). The tests use a model derived from the contract sources, not a live chain; CI runs them with the build (`.github/workflows/ci.yml`).

## Getting started

Requirements: Node.js 20+, a wallet with Bradbury testnet GEN.

```bash
git clone https://github.com/MIKI4222/ReleaseShield.git
cd ReleaseShield
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | Optional RPC override; empty uses the `genlayer-js` Bradbury default |
| `NEXT_PUBLIC_NOTARY_ADDRESS` | AI Notary contract address |
| `NEXT_PUBLIC_GATE_ADDRESS` | Dependency Release Gate contract address |

## Deploy to Netlify

The app is a static Next.js export (`output: "export"`).

1. Push the repo to GitHub and import it in Netlify.
2. Build command `npm run build`, publish directory `out` (already set in `netlify.toml`).
3. Optionally add the variables above under *Site settings → Environment variables*.

## Tech stack

Next.js 14 (static export), React 18, Tailwind CSS, Lucide icons, `genlayer-js`.

## Project structure

```
src/lib/api.ts            contract-facing logic (reads, writes, state mapping), testable without a browser
src/lib/genlayer.ts       genlayer-js client, tx status polling, audit log
src/components/           Wallet context/button, TxStatus stepper
src/app/                  /, /notary, /release-gate, /audit
tests/                    signature manifest, mock chain, workflow tests
SUBMISSION.md             notes for the GenLayer Portal
```

## License

MIT
