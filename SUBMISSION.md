# ReleaseShield & AI Notary — submission notes (GenLayer Portal: Projects)

- Source code: https://github.com/MIKI4222/ReleaseShield
- Live demo: <!-- add Netlify URL after deploy -->

**What it does.** A frontend platform over two deployed Intelligent Contracts on Bradbury: AI Notary (`0x70751232Dcc5296d1180E86BDF51373f5b72759B`) and Dependency Release Gate (`0xC0CEa82374C4F1bcE296FCDF6818F10A1a20a1aA`). The contracts are unchanged.

**Problem.** Web evidence (audit reports, terms, advisories) is easy to change or deny, and release authorizations rely on a human or a centralized script to vouch for a dependency.
- AI Notary: validators render the page themselves, an LLM judges whether the claim is supported, and the verdict is recorded append-only.
- Release Gate: validators fetch npm metadata and agree on ELIGIBLE/INELIGIBLE under a fixed policy; an optimistic challenge window follows; finalization and a one-time public authorization claim are recorded.

**End-to-end flow.** notarize an audit page → Evaluate Dependencies (`propose_eligibility`) → anyone may `challenge_eligibility` using the notarized URL as evidence → wait out the window → `finalize_eligibility` → `claim_authorization` → owner `reset_cycle`. Everything is visible in Audit.

**Transaction lifecycle.** The UI polls the real consensus status of each transaction (PENDING → PROPOSING/COMMITTING/REVEALING → ACCEPTED/FINALIZED, or UNDETERMINED/CANCELED/timeouts) and shows the raw network status. Read errors are surfaced, never replaced by empty data.

**How to use.** `npm install && npm run dev`, connect MetaMask (Bradbury is added automatically), open /notary or /release-gate. Owner-only calls (`set_package_source`, `set_challenge_period`, `reopen_challenged_cycle`, `reset_cycle`) work only from the gate owner's wallet.

**Custody.** Neither contract holds funds. The gate records an authorization; it does not deploy software or transfer tokens.

**Tests.** `npm test` runs the notary and gate workflows (including the challenge and rejection paths) through the app's real API layer against a model that enforces the contracts' exact method signatures; see `tests/` and the CI workflow. This is a model derived from the contract sources, not a live-chain test.

**Limits.** The gate is a single npm-focused gate with owner-only configuration and no getters for its source/owner; AI Notary stores no timestamp and needs static or server-rendered pages.

**Path to continued use.** Per-project gates for release pipelines and DAO grant adapters, notarized audit evidence feeding gate challenges, richer eligibility policies, and notifications.
