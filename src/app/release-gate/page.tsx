"use client";
import { useEffect, useState } from "react";
import { read, write, GATE, Stage } from "@/lib/genlayer";
import { getGate, gateState, secondsLeft, proposeEligibility, challengeEligibility, finalizeEligibility, claimAuthorization, reopenChallengedCycle, resetCycle, setPackageSource, setChallengePeriod, Gate, Writer } from "@/lib/api";
import { useWallet } from "@/components/Wallet";
import TxStatus from "@/components/TxStatus";
const tone: Record<string, string> = { locked: "border-amber-700/60 text-amber-300", pending: "border-amber-700/60 text-amber-300", open: "border-emerald-700/60 text-emerald-400", claimed: "border-emerald-700/60 text-emerald-400", rejected: "border-red-700/60 text-red-400" };
const LABELS = ["Broadcasting Transaction", "Fetching npm metadata & awaiting validators", "GenVM Consensus Verification (AI)", "Recorded on-chain"];
export default function ReleaseGate() {
  const { account, connect } = useWallet();
  const [g, setG] = useState<Gate | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [stage, setStage] = useState<Stage>("idle");
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [evidence, setEvidence] = useState("");
  const [recNote, setRecNote] = useState("");
  const [label, setLabel] = useState("");
  const [src, setSrc] = useState({ url: "https://registry.npmjs.org/axios/latest", name: "axios" });
  const [period, setPeriod] = useState("300");
  const load = () => getGate(read, GATE).then((x) => { setG(x); setLoadErr(""); }).catch((e) => setLoadErr(e.message));
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("evidence")) { setEvidence(q.get("evidence") || ""); setRecNote(q.get("record") ? `AI Notary record #${q.get("record")}` : ""); }
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const w: Writer = (a, fn, args, v = 0n) => write(a, fn, args, account, (s, d) => { setStage(s); setDetail(d || ""); }, v);
  const run = async (fn: () => Promise<any>) => {
    if (!account) return connect();
    setMsg("");
    try { await fn(); await load(); } catch (e: any) { setMsg(e.message); }
  };
  const st = g && gateState(g);
  const left = g ? secondsLeft(g, now) : 0;
  const row = (k: string, v: any) => <div className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="min-w-0 break-all text-right">{v === "" || v === undefined ? "—" : String(v)}</span></div>;
  return <>
    <h1 className="text-2xl font-bold">Dependency Release Gate</h1>
    <p className="text-sm text-slate-500">One gate on this deployment: validators fetch npm package metadata, apply a fixed policy (name match, version, <code>dist.integrity</code>, not deprecated, HTTPS tarball), then an optimistic challenge window opens. The contract records an authorization only; it does not deploy software or move funds.</p>
    {loadErr && <p className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">Read error: {loadErr}</p>}
    {g && st && <div className={`card border ${tone[st.tone]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{st.label}</h2><span className="text-xs text-slate-500">status {g.status} · cycle #{g.cycleId} · completed {g.completed}</span></div>
      <p className="mt-1 text-sm text-slate-400">{st.next}</p>
      <div className="mt-3 space-y-1 text-sm">
        {row("Decision", g.decision)}{row("Package version", g.version)}{row("Reason", g.reason)}
        {row("Challenge deadline", g.deadline ? `${new Date(g.deadline * 1000).toLocaleString()}${g.status === "OPEN" ? (left > 0 ? ` (${left}s left)` : " (ended)") : ""}` : "")}
        {row("Challenge evidence", g.evidence)}{row("can_finalize / can_claim", `${g.canFinalize} / ${g.canClaim}`)}
      </div>
    </div>}
    <div className="card space-y-3">
      <h2 className="font-semibold">Run the gate</h2>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => run(() => proposeEligibility(w, GATE))}>Evaluate Dependencies &amp; Unlock Release</button>
        <button className="btn2" disabled={!g?.canFinalize} onClick={() => run(() => finalizeEligibility(read, w, GATE))}>finalize_eligibility</button>
      </div>
      <p className="text-xs text-slate-500">Evaluate = <code>propose_eligibility</code>. If validators agree the package is eligible, the challenge window opens; after it ends, finalize opens the gate.</p>
      <div className="flex flex-wrap gap-2"><input className="inp max-w-xs" placeholder="Authorization label, e.g. release-1.2.0" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn2" disabled={!g?.canClaim} onClick={() => run(() => claimAuthorization(read, w, GATE, label))}>claim_authorization</button></div>
      <TxStatus stage={stage} detail={detail} labels={LABELS} />{msg && <p className="text-sm text-red-400">{msg}</p>}
    </div>
    <div className="card space-y-3">
      <h2 className="font-semibold">Challenge an open proposal (anyone)</h2>
      <input className="inp" placeholder="Evidence URL (e.g. a page notarized in AI Notary)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      {recNote && <p className="text-xs text-indigo-300">Prefilled from {recNote}</p>}
      <button className="btn2" disabled={g?.status !== "OPEN"} onClick={() => run(() => challengeEligibility(w, GATE, evidence))}>challenge_eligibility</button>
      <p className="text-xs text-slate-500">Only possible while the status is OPEN and the deadline has not passed. A challenge blocks finalization; it is recorded, not adjudicated by the contract.</p>
    </div>
    <div className="card space-y-3">
      <h2 className="font-semibold">Owner controls</h2>
      <p className="text-xs text-slate-500">These calls revert for non-owner wallets. The contract has no getter for the owner, the configured package source or the period (defaults: axios, 30 s), so the form values below are only what you send.</p>
      <input className="inp" value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} placeholder="Registry URL, e.g. https://registry.npmjs.org/<pkg>/<version>" />
      <input className="inp" value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} placeholder="Expected package name" />
      <div className="flex flex-wrap gap-2">
        <button className="btn2" onClick={() => run(() => setPackageSource(w, GATE, src.url, src.name))}>set_package_source</button>
        <input className="inp max-w-[10rem]" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="seconds" />
        <button className="btn2" onClick={() => run(() => setChallengePeriod(w, GATE, period))}>set_challenge_period</button>
        <button className="btn2" disabled={g?.status !== "CHALLENGED"} onClick={() => run(() => reopenChallengedCycle(w, GATE))}>reopen_challenged_cycle</button>
        <button className="btn2" onClick={() => run(() => resetCycle(w, GATE))}>reset_cycle</button>
      </div>
    </div>
  </>;
}
