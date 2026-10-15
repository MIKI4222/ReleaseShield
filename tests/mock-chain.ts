import { NOTARY_SIG, GATE_SIG, Sig } from "./signatures.ts";
export const NOTARY_ADDR = "0x70751232Dcc5296d1180E86BDF51373f5b72759B";
export const GATE_ADDR = "0xC0CEa82374C4F1bcE296FCDF6818F10A1a20a1aA";
const lc = (s: string) => s.toLowerCase();
const err = (m: string) => new Error(m);

// In-memory model of both contracts. It REJECTS any call that does not match the real signatures
// (unknown method, wrong argument count, view/write mix-up, value attached to a non-payable method).
export class MockChain {
  now = 1_800_000_000; // seconds
  owner = "0xowner";
  records: string[] = [];
  pages: Record<string, string> = {};                                   // url -> page text seen by validators
  judge = (claim: string, page: string) => ({ verdict: page.toLowerCase().includes(claim.toLowerCase()) ? "confirmed" : "not_confirmed", reasoning: "Judged from page content." });
  // gate state (mirrors DependencyReleaseGate storage)
  g = { url: "https://registry.npmjs.org/axios/latest", name: "axios", period: 30, cycle: 1, status: "READY", decision: "NONE", version: "", reason: "", deadline: 0, challenged: false, evidence: "", finalized: false, claimed: false, completed: 0 };
  registry = (_url: string, _name: string) => ({ decision: "ELIGIBLE", version: "1.20.0", reason: "package eligible" });
  calls: { fn: string; args: any[]; sender: string }[] = [];

  as(sender: string) {
    return {
      read: async (a: string, fn: string, args: any[] = []) => this.call(a, fn, args, sender, 0n, "view"),
      write: async (a: string, fn: string, args: any[], value: bigint = 0n) => this.call(a, fn, args, sender, value, "write"),
    };
  }
  private call(addr: string, fn: string, args: any[], sender: string, value: bigint, mode: "view" | "write") {
    const isN = lc(addr) === lc(NOTARY_ADDR), isG = lc(addr) === lc(GATE_ADDR);
    if (!isN && !isG) throw err(`no contract at ${addr}`);
    const sig: Sig | undefined = (isN ? NOTARY_SIG : GATE_SIG)[fn];
    if (!sig) throw err(`method ${fn} does not exist on contract`);
    if ((mode === "view") !== (sig.kind === "view")) throw err(`${fn} is a ${sig.kind} method, called as ${mode}`);
    if (args.length !== sig.argc) throw err(`${fn} expects ${sig.argc} argument(s), got ${args.length}`);
    if (value > 0n) throw err(`${fn} is not payable but value ${value} was attached`);
    this.calls.push({ fn, args, sender });
    return isN ? this.notary(fn, args, lc(sender)) : this.gate(fn, args, lc(sender));
  }
  private notary(fn: string, a: any[], who: string): any {
    switch (fn) {
      case "notarize": {
        if (!a[0]) throw err("URL cannot be empty"); if (!a[1]) throw err("Claim cannot be empty");
        const r = this.judge(a[1], this.pages[a[0]] ?? "");
        this.records.push(JSON.stringify({ claim: a[1], id: this.records.length, reasoning: r.reasoning, submitter: who, url: a[0], verdict: r.verdict })); return null;
      }
      case "get_all_records": return [...this.records];
      case "total_records": return this.records.length;
      case "get_record": { if (!(a[0] >= 0 && a[0] < this.records.length)) throw err("Invalid record ID"); return this.records[a[0]]; }
    }
  }
  private gate(fn: string, a: any[], who: string): any {
    const g = this.g; const owner = () => { if (who !== this.owner) throw err("only owner can do this"); };
    const active = () => g.status === "OPEN" || g.status === "CHALLENGED";
    const clear = () => { g.status = "READY"; g.decision = "NONE"; g.version = ""; g.reason = ""; g.deadline = 0; g.challenged = false; g.evidence = ""; g.finalized = false; g.claimed = false; };
    switch (fn) {
      case "get_status": return g.status; case "get_cycle_id": return g.cycle; case "get_decision": return g.decision;
      case "get_package_version": return g.version; case "get_reason": return g.reason; case "get_challenge_deadline": return g.deadline;
      case "get_challenge_evidence": return g.evidence; case "get_completed_cycles": return g.completed;
      case "can_finalize": return g.status === "OPEN" && !g.challenged && this.now >= g.deadline;
      case "can_claim": return g.finalized && !g.claimed;
      case "set_package_source": { owner(); if (!a[0] || !a[1]) throw err("URL and package name are required"); if (active()) throw err("cannot change source during active cycle"); Object.assign(g, { url: a[0], name: a[1] }); clear(); return true; }
      case "set_challenge_period": { owner(); if (!(a[0] > 0)) throw err("period must be greater than zero"); if (active()) throw err("cannot change period during active cycle"); g.period = a[0]; return true; }
      case "propose_eligibility": {
        if (active()) throw err("a cycle is already active"); if (g.finalized && !g.claimed) throw err("claim or reset the completed cycle first");
        const r = this.registry(g.url, g.name);
        Object.assign(g, { decision: r.decision, version: r.version, reason: r.reason, challenged: false, evidence: "", finalized: false, claimed: false });
        if (r.decision === "ELIGIBLE") { g.status = "OPEN"; g.deadline = this.now + g.period; return true; }
        g.status = "INELIGIBLE"; g.deadline = 0; return false;
      }
      case "challenge_eligibility": { if (g.status !== "OPEN") throw err("no open eligible proposal"); if (!a[0]) throw err("evidence URL is required"); if (this.now >= g.deadline) throw err("challenge period has ended"); g.challenged = true; g.evidence = a[0]; g.status = "CHALLENGED"; return true; }
      case "reopen_challenged_cycle": { owner(); if (g.status !== "CHALLENGED") throw err("cycle is not challenged"); clear(); return true; }
      case "finalize_eligibility": { if (g.status !== "OPEN") throw err("no open proposal"); if (g.challenged) throw err("challenged proposal cannot be finalized"); if (this.now < g.deadline) throw err("challenge period is still active"); g.finalized = true; g.status = "FINALIZED"; g.completed += 1; return true; }
      case "claim_authorization": { if (!g.finalized) throw err("eligibility is not finalized"); if (g.claimed) throw err("authorization already claimed"); if (!a[0]) throw err("label is required"); g.claimed = true; g.status = "CLAIMED"; return "Deployment authorization granted for: " + a[0]; }
      case "reset_cycle": { owner(); if (active()) throw err("active cycle must be finalized or reopened"); g.cycle += 1; clear(); return true; }
    }
  }
}
