"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { EXPLORER, NOTARY, GATE, AuditEntry, read } from "@/lib/genlayer";
import { getRecords, getGate, gateState, NotaryRecord, Gate } from "@/lib/api";
export default function Audit() {
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [recs, setRecs] = useState<NotaryRecord[]>([]);
  const [gate, setGate] = useState<Gate | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  useEffect(() => {
    setLog(JSON.parse(localStorage.getItem("rs_audit") || "[]"));
    const add = (m: string) => setErrs((p) => [...p, m]);
    getRecords(read, NOTARY).then(setRecs).catch((e) => add(`get_all_records: ${e.message}`));
    getGate(read, GATE).then(setGate).catch((e) => add(`Release Gate: ${e.message}`));
  }, []);
  return <>
    <h1 className="text-2xl font-bold">Verification &amp; Audit Trail</h1>
    <div className="flex gap-3 text-sm">
      <a className="btn2" target="_blank" href={`${EXPLORER}/address/${NOTARY}`}>AI Notary <ExternalLink size={12} /></a>
      <a className="btn2" target="_blank" href={`${EXPLORER}/address/${GATE}`}>Release Gate <ExternalLink size={12} /></a>
    </div>
    {errs.map((e, i) => <p key={i} className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">Read error: {e}</p>)}
    <h2 className="font-semibold">Release Gate — current state (live)</h2>
    {gate && <div className="card text-sm">{gateState(gate).label} · cycle #{gate.cycleId} · decision {gate.decision} {gate.version && `· v${gate.version}`}<div className="text-xs text-slate-500">{gate.reason}</div><details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">raw</summary><pre className="overflow-auto">{JSON.stringify(gate, null, 2)}</pre></details></div>}
    <p className="text-xs text-slate-500">The gate stores only its current cycle (no history views); past cycles are visible in the transaction log below and on the explorer.</p>
    <h2 className="font-semibold">AI Notary records (live, append-only)</h2>
    {recs.slice().reverse().map((r) => <div key={r.id} className="card text-sm">#{r.id} · <span className={r.verdict === "confirmed" ? "text-emerald-400" : "text-amber-400"}>{r.verdict}</span> · <span className="break-all">{r.url}</span><div className="text-xs text-slate-400">{r.reasoning}</div><details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">raw AI-consensus record</summary><pre className="overflow-auto">{r.raw}</pre></details></div>)}
    <h2 className="font-semibold">Transactions sent from this browser</h2>
    {!log.length && <p className="text-sm text-slate-500">None yet.</p>}
    {log.map((e, i) => (
      <details key={i} className="card"><summary className="cursor-pointer text-sm">
        {new Date(e.ts).toLocaleString()} · {e.contract}.{e.fn} · <span className={e.status === "accepted" ? "text-emerald-400" : "text-red-400"}>{e.status}</span>
        {e.hash && <> · <a className="text-indigo-400" target="_blank" href={`${EXPLORER}/tx/${e.hash}`}>{e.hash.slice(0, 10)}…</a></>}
      </summary><pre className="mt-3 max-h-80 overflow-auto text-xs">{e.raw}</pre></details>))}
  </>;
}
