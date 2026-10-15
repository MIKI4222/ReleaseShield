// Method signatures copied from the contract sources the app targets:
//   ai_notary_final.py (AINotary)        https://github.com/MIKI4222/ai-notary-genlayer
//   contract.py (DependencyReleaseGate)  https://github.com/MIKI4222/genlayer-dependency-release-gate
// Neither contract has a payable method. argc = number of arguments.
export type Sig = { kind: "view" | "write"; argc: number };
const v = (argc = 0): Sig => ({ kind: "view", argc });
const w = (argc = 0): Sig => ({ kind: "write", argc });
export const NOTARY_SIG: Record<string, Sig> = { notarize: w(2), get_record: v(1), get_all_records: v(0), total_records: v(0) };
export const GATE_SIG: Record<string, Sig> = {
  set_package_source: w(2), set_challenge_period: w(1), propose_eligibility: w(0), challenge_eligibility: w(1),
  reopen_challenged_cycle: w(0), finalize_eligibility: w(0), claim_authorization: w(1), reset_cycle: w(0),
  get_status: v(), get_cycle_id: v(), get_decision: v(), get_package_version: v(), get_reason: v(),
  get_challenge_deadline: v(), get_challenge_evidence: v(), get_completed_cycles: v(), can_finalize: v(), can_claim: v(),
};
