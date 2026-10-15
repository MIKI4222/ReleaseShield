// Pure contract-facing logic (no browser / SDK imports): testable against the exact method signatures of
//   ai_notary_final.py (AINotary)  and  contract.py (DependencyReleaseGate).
export type Reader = (address: string, fn: string, args?: any[]) => Promise<any>;
export type Writer = (address: string, fn: string, args: any[], value?: bigint) => Promise<any>;

export const parse = (v: any) => { if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } } return v; };

// ---------- AI Notary ----------
// Record (stored as a JSON string): { id, url, claim, verdict: "confirmed" | "not_confirmed", reasoning, submitter }
export type NotaryRecord = { id: number; url: string; claim: string; verdict: string; reasoning: string; submitter: string; raw: string };
export async function getRecords(read: Reader, notary: string): Promise<NotaryRecord[]> {
  const v = await read(notary, "get_all_records"); // list[str]; errors propagate, never an empty fallback
  if (!Array.isArray(v)) throw new Error(`get_all_records: expected a list from the contract, got ${typeof v}`);
  return v.map((s) => { const r = parse(s); return { id: Number(r.id), url: String(r.url), claim: String(r.claim), verdict: String(r.verdict), reasoning: String(r.reasoning ?? ""), submitter: String(r.submitter ?? ""), raw: String(s) }; });
}
export async function getRecord(read: Reader, notary: string, id: number): Promise<NotaryRecord> {
  if (!Number.isInteger(id) || id < 0) throw new Error("Record ID must be a non-negative integer");
  const raw = await read(notary, "get_record", [id]);
  const r = parse(raw);
  return { id: Number(r.id), url: String(r.url), claim: String(r.claim), verdict: String(r.verdict), reasoning: String(r.reasoning ?? ""), submitter: String(r.submitter ?? ""), raw: String(raw) };
}
export async function getTotalRecords(read: Reader, notary: string): Promise<number> { return Number(await read(notary, "total_records")); }
export function notarize(write: Writer, notary: string, url: string, claim: string) {
  if (!/^https?:\/\/\S+$/i.test(url.trim())) throw new Error("URL must start with http:// or https://");
  if (!claim.trim()) throw new Error("Claim cannot be empty");
  return write(notary, "notarize", [url.trim(), claim.trim()], 0n);
}
// SHA-256 of the exact record string stored on-chain (computed in the browser; the contract stores no hash/timestamp).
export async function fingerprint(raw: string): Promise<string> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Dependency Release Gate ----------
// Statuses: READY | OPEN | CHALLENGED | INELIGIBLE | FINALIZED | CLAIMED
export type Gate = { status: string; cycleId: number; decision: string; version: string; reason: string; deadline: number; evidence: string; completed: number; canFinalize: boolean; canClaim: boolean };
export async function getGate(read: Reader, gate: string): Promise<Gate> {
  const [status, cycle, decision, version, reason, deadline, evidence, completed, canFinalize, canClaim] = await Promise.all([
    read(gate, "get_status"), read(gate, "get_cycle_id"), read(gate, "get_decision"), read(gate, "get_package_version"), read(gate, "get_reason"),
    read(gate, "get_challenge_deadline"), read(gate, "get_challenge_evidence"), read(gate, "get_completed_cycles"), read(gate, "can_finalize"), read(gate, "can_claim"),
  ]);
  return { status: String(status), cycleId: Number(cycle), decision: String(decision), version: String(version), reason: String(reason), deadline: Number(deadline), evidence: String(evidence), completed: Number(completed), canFinalize: Boolean(canFinalize), canClaim: Boolean(canClaim) };
}
export type Tone = "locked" | "pending" | "open" | "claimed" | "rejected";
export function gateState(g: Pick<Gate, "status" | "canFinalize">): { label: string; tone: Tone; next: string } {
  switch (g.status) {
    case "READY": return { label: "Locked (No assessment yet)", tone: "locked", next: "Run “Evaluate Dependencies” to start validator verification." };
    case "OPEN": return g.canFinalize
      ? { label: "Locked (Challenge window ended)", tone: "pending", next: "Finalize to open the gate." }
      : { label: "Locked (Pending challenge period)", tone: "pending", next: "Anyone can challenge with evidence until the deadline; then finalize." };
    case "CHALLENGED": return { label: "Locked (Challenged)", tone: "locked", next: "The owner must reopen the cycle, then re-evaluate." };
    case "FINALIZED": return { label: "Approved (Gate Open)", tone: "open", next: "Claim the one-time public authorization." };
    case "CLAIMED": return { label: "Approved (Authorization claimed)", tone: "claimed", next: "The owner can reset the cycle for a new release." };
    case "INELIGIBLE": return { label: "Rejected", tone: "rejected", next: "Fix the package or source, then evaluate again." };
    default: return { label: g.status || "Unknown", tone: "locked", next: "" };
  }
}
export const secondsLeft = (g: Pick<Gate, "deadline">, nowSec: number) => Math.max(0, g.deadline - nowSec);

export const proposeEligibility = (write: Writer, gate: string) => write(gate, "propose_eligibility", [], 0n);
export function challengeEligibility(write: Writer, gate: string, evidenceUrl: string) {
  if (!/^https?:\/\/\S+$/i.test(evidenceUrl.trim())) throw new Error("Evidence must be an http(s) URL");
  return write(gate, "challenge_eligibility", [evidenceUrl.trim()], 0n);
}
export async function finalizeEligibility(read: Reader, write: Writer, gate: string) {
  if (!(await read(gate, "can_finalize"))) throw new Error("Not finalizable yet: needs an OPEN, unchallenged proposal whose challenge period has ended");
  return write(gate, "finalize_eligibility", [], 0n);
}
export async function claimAuthorization(read: Reader, write: Writer, gate: string, label: string) {
  if (!label.trim()) throw new Error("A label is required");
  if (!(await read(gate, "can_claim"))) throw new Error("Nothing to claim: eligibility must be finalized and unclaimed");
  return write(gate, "claim_authorization", [label.trim()], 0n);
}
export const reopenChallengedCycle = (write: Writer, gate: string) => write(gate, "reopen_challenged_cycle", [], 0n);
export const resetCycle = (write: Writer, gate: string) => write(gate, "reset_cycle", [], 0n);
export function setPackageSource(write: Writer, gate: string, url: string, name: string) {
  if (!url.trim() || !name.trim()) throw new Error("URL and package name are required");
  return write(gate, "set_package_source", [url.trim(), name.trim()], 0n);
}
export function setChallengePeriod(write: Writer, gate: string, seconds: string) {
  const n = Number(seconds);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Period must be a positive number of seconds");
  return write(gate, "set_challenge_period", [n], 0n);
}
