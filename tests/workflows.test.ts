import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MockChain, NOTARY_ADDR as N, GATE_ADDR as G } from "./mock-chain.ts";
import { NOTARY_SIG, GATE_SIG } from "./signatures.ts";
import * as api from "../src/lib/api.ts";

const OWNER = "0xOwner", ALICE = "0xAlice", BOB = "0xBob";
const AUDIT = "https://example.com/audit-report";
const mk = () => { const c = new MockChain(); c.owner = OWNER.toLowerCase(); return c; };

test("Workflow 1 — AI Notary: notarize pages, read records, fingerprints", async () => {
  const c = mk(), alice = c.as(ALICE);
  c.pages[AUDIT] = "Independent audit completed. No critical issues were found in release 1.2.0.";
  await api.notarize(alice.write, N, AUDIT, "No critical issues were found");
  await api.notarize(alice.write, N, AUDIT, "The audit found a critical reentrancy bug");
  const recs = await api.getRecords(alice.read, N);
  assert.equal(recs.length, 2);
  assert.deepEqual(recs.map((r) => r.verdict), ["confirmed", "not_confirmed"]);
  assert.equal(recs[0].submitter, ALICE.toLowerCase());
  assert.equal(recs[0].url, AUDIT);
  assert.equal(await api.getTotalRecords(alice.read, N), 2);
  assert.deepEqual((await api.getRecord(alice.read, N, 1)).verdict, "not_confirmed");
  await assert.rejects(api.getRecord(alice.read, N, 9), /Invalid record ID/);
  const f1 = await api.fingerprint(recs[0].raw), f2 = await api.fingerprint(recs[1].raw);
  assert.match(f1, /^[0-9a-f]{64}$/); assert.notEqual(f1, f2);
  assert.equal(await api.fingerprint(recs[0].raw), f1); // deterministic
  // client-side validation mirrors contract asserts (no doomed transactions)
  assert.throws(() => api.notarize(alice.write, N, "not-a-url", "x"), /http/);
  assert.throws(() => api.notarize(alice.write, N, AUDIT, "  "), /Claim/);
  assert.equal(c.calls.filter((x) => x.fn === "notarize").length, 2);
});

test("Workflow 2 — Release Gate: evaluate, wait out the challenge period, finalize, claim, reset", async () => {
  const c = mk(), owner = c.as(OWNER), alice = c.as(ALICE);
  await api.setChallengePeriod(owner.write, G, "300");
  await api.proposeEligibility(alice.write, G);
  let g = await api.getGate(alice.read, G);
  assert.equal(g.status, "OPEN"); assert.equal(g.decision, "ELIGIBLE"); assert.equal(g.version, "1.20.0");
  assert.equal(api.gateState(g).tone, "pending");
  assert.equal(api.secondsLeft(g, c.now), 300);
  await assert.rejects(api.finalizeEligibility(alice.read, alice.write, G), /Not finalizable/); // blocked before any tx
  assert.equal(c.calls.filter((x) => x.fn === "finalize_eligibility").length, 0);

  c.now += 301;
  g = await api.getGate(alice.read, G);
  assert.equal(g.canFinalize, true);
  await api.finalizeEligibility(alice.read, alice.write, G);
  g = await api.getGate(alice.read, G);
  assert.equal(g.status, "FINALIZED"); assert.equal(api.gateState(g).label, "Approved (Gate Open)"); assert.equal(g.completed, 1);

  await assert.rejects(api.claimAuthorization(alice.read, alice.write, G, " "), /label/);
  await api.claimAuthorization(alice.read, alice.write, G, "release-1.2.0");
  g = await api.getGate(alice.read, G);
  assert.equal(g.status, "CLAIMED");
  await assert.rejects(api.claimAuthorization(alice.read, alice.write, G, "again"), /Nothing to claim/);

  await assert.rejects(api.resetCycle(alice.write, G), /only owner/);
  await api.resetCycle(owner.write, G);
  g = await api.getGate(alice.read, G);
  assert.equal(g.status, "READY"); assert.equal(g.cycleId, 2);
});

test("Release Gate challenge path and rejection path", async () => {
  const c = mk(), owner = c.as(OWNER), alice = c.as(ALICE), bob = c.as(BOB);
  await api.proposeEligibility(alice.write, G);
  await assert.rejects(api.proposeEligibility(bob.write, G), /already active/);
  assert.throws(() => api.challengeEligibility(bob.write, G, "nope"), /http/);
  await api.challengeEligibility(bob.write, G, AUDIT);                    // evidence = a notarized page
  let g = await api.getGate(alice.read, G);
  assert.equal(g.status, "CHALLENGED"); assert.equal(g.evidence, AUDIT);
  c.now += 1000;
  await assert.rejects(api.finalizeEligibility(alice.read, alice.write, G), /Not finalizable/);
  await assert.rejects(api.reopenChallengedCycle(bob.write, G), /only owner/);
  await api.reopenChallengedCycle(owner.write, G);
  assert.equal((await api.getGate(alice.read, G)).status, "READY");

  c.registry = () => ({ decision: "INELIGIBLE", version: "0.0.1", reason: "package deprecated" });
  await api.proposeEligibility(alice.write, G);
  g = await api.getGate(alice.read, G);
  assert.equal(g.status, "INELIGIBLE"); assert.equal(api.gateState(g).tone, "rejected"); assert.match(g.reason, /deprecated/);
  await assert.rejects(async () => api.setChallengePeriod(owner.write, G, "0"), /positive/);
  await api.setPackageSource(owner.write, G, "https://registry.npmjs.org/lodash/latest", "lodash"); // allowed outside an active cycle
  assert.equal((await api.getGate(alice.read, G)).status, "READY");
});

test("the mock enforces real signatures", async () => {
  const c = mk(), r = c.as(ALICE);
  await assert.rejects(r.write(N, "notarize", ["only-url"]), /expects 2/);
  await assert.rejects(r.write(G, "propose_eligibility", [], 1n), /not payable/);
  await assert.rejects(r.read(N, "get_record", [5]), /Invalid record ID/);
  await assert.rejects(r.read(G, "get_claim_label", []), /does not exist/); // mentioned in a README, absent from the source
  await assert.rejects(r.read(G, "propose_eligibility", []), /write method, called as view/);
});

test("read errors surface instead of becoming empty data", async () => {
  const broken: api.Reader = async () => { throw new Error("RPC unavailable"); };
  await assert.rejects(api.getRecords(broken, N), /RPC unavailable/);
  await assert.rejects(api.getGate(broken, G), /RPC unavailable/);
  await assert.rejects(api.getRecords((async () => "oops") as api.Reader, N), /expected a list/);
});

test("every contract method called from src/ exists in the contract signatures", () => {
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); });
  walk("src");
  const known = new Set([...Object.keys(NOTARY_SIG), ...Object.keys(GATE_SIG)]);
  const used = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/(?:read|write)\(\s*(?:NOTARY|GATE|notary|gate)\s*,\s*"([a-z_]+)"/g)) used.add(m[1]);
  assert.ok(used.size >= 20, `expected many calls, found ${used.size}`);
  for (const fn of used) assert.ok(known.has(fn), `${fn} is not a method of the deployed contracts`);
  for (const fn of known) assert.ok(used.has(fn), `${fn} is never used by the app`);
});
