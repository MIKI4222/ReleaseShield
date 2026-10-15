"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { read, NOTARY, GATE } from "@/lib/genlayer";
import { getGate, getRecords, gateState, Gate, NotaryRecord } from "@/lib/api";
const tone: Record<string, string> = { locked: "text-amber-300", pending: "text-amber-300", open: "text-emerald-400", claimed: "text-emerald-400", rejected: "text-red-400" };
export default function Home() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [recs, setRecs] = useState<NotaryRecord[] | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  useEffect(() => {
    const add = (m: string) => setErrs((p) => [...p, m]);
    getGate(read, GATE).then(setGate).catch((e) => add(`Release Gate: ${e.message}`));
    getRecords(read, NOTARY).then(setRecs).catch((e) => add(`AI Notary: ${e.message}`));
  }, []);
  const st = gate && gateState(gate);
  const confirmed = recs?.filter((r) => r.verdict === "confirmed").length;
  const box = (t: string, x: any, cls = "") => <div className="card min-w-0"><div className="truncate text-xs text-slate-500">{t}</div><div className={`mt-1 break-words text-xl font-semibold sm:text-2xl ${cls}`}>{x ?? "…"}</div></div>;
  return <>
    <h1 className="text-3xl font-bold">Verify the web. Gate the release.</h1>
    <p className="text-slate-400">AI Notary records whether a web page really supports a claim, by validator consensus. The Dependency Release Gate lets validators inspect npm release metadata, opens an optimistic challenge window, and only then issues a one-time public authorization.</p>
    {errs.map((e, i) => <p key={i} className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">Read error — {e}</p>)}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {box("Release gate", st && st.label, st ? tone[st.tone] : "")}
      {box("Gate cycle / completed", gate && `#${gate.cycleId} / ${gate.completed}`)}
      {box("Notarized records", recs && recs.length)}
      {box("Claims confirmed", recs && `${confirmed} of ${recs.length}`)}
    </div>
    <div className="flex flex-wrap gap-3"><Link className="btn" href="/notary">Notarize a page</Link><Link className="btn" href="/release-gate">Open the gate</Link><Link className="btn2" href="/audit">Live on-chain audit</Link></div>
    <div className="card space-y-2 text-sm">
      <h2 className="font-semibold text-slate-200">Latest notarized documents</h2>
      {recs && !recs.length && <p className="text-slate-500">No records yet.</p>}
      {recs?.slice(-3).reverse().map((r) => <div key={r.id} className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-all text-slate-400">#{r.id} {r.url}</span><span className={r.verdict === "confirmed" ? "text-emerald-400" : "text-amber-400"}>{r.verdict}</span></div>)}
    </div>
    <div className="card text-sm text-slate-400"><b className="text-slate-200">How they connect:</b> notarize an audit report or advisory page; if a gate proposal is open and the notarized evidence contradicts the release, use that URL to <code>challenge_eligibility</code>, which blocks finalization until the owner reopens the cycle. Neither contract moves funds: the gate only records an authorization.</div>
  </>;
}
