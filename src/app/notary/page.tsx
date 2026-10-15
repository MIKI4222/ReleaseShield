"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { read, write, NOTARY, Stage } from "@/lib/genlayer";
import { getRecords, getRecord, notarize, fingerprint, NotaryRecord, Writer } from "@/lib/api";
import { useWallet } from "@/components/Wallet";
import TxStatus from "@/components/TxStatus";
const LABELS = ["Broadcasting Transaction", "Fetching Web Page & awaiting validators", "GenVM Consensus Verification (AI)", "Notarized Proof Generated"];
export default function Notary() {
  const { account, connect } = useWallet();
  const [recs, setRecs] = useState<NotaryRecord[]>([]);
  const [fps, setFps] = useState<Record<number, string>>({});
  const [url, setUrl] = useState("");
  const [claim, setClaim] = useState("");
  const [q, setQ] = useState("");
  const [vf, setVf] = useState("all");
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<NotaryRecord | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const load = () => getRecords(read, NOTARY).then((r) => { setRecs(r); setLoadErr(""); r.forEach((x) => fingerprint(x.raw).then((h) => setFps((p) => ({ ...p, [x.id]: h })))); }).catch((e) => setLoadErr(`get_all_records: ${e.message}`));
  useEffect(() => { load(); }, []);
  const w: Writer = (a, fn, args, v = 0n) => write(a, fn, args, account, (s, d) => { setStage(s); setDetail(d || ""); }, v);
  const run = async (fn: () => Promise<any>) => {
    if (!account) return connect();
    setMsg("");
    try { await fn(); await load(); } catch (e: any) { setMsg(e.message); }
  };
  const shown = recs.filter((r) => (vf === "all" || r.verdict === vf) && (!q || `${r.id} ${r.url} ${r.claim} ${r.submitter}`.toLowerCase().includes(q.toLowerCase()))).reverse();
  return <>
    <h1 className="text-2xl font-bold">AI Web Notary</h1>
    <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">Validators fetch the page without waiting for client-side JavaScript, so use static or server-rendered pages. A heavy single-page app may produce a false <code>not_confirmed</code>. Records are append-only; the contract stores no timestamp, so the fingerprint below is a SHA-256 computed in your browser from the exact stored record.</p>
    {loadErr && <p className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">Read error: {loadErr}</p>}
    <div className="card space-y-3">
      <h2 className="font-semibold">Notarize a claim</h2>
      <input className="inp" placeholder="https://example.com/audit-report" value={url} onChange={(e) => setUrl(e.target.value)} />
      <textarea className="inp" placeholder="Claim to verify, e.g. “No critical issues were found in release 1.2.0”" value={claim} onChange={(e) => setClaim(e.target.value)} />
      <button className="btn" onClick={() => run(() => notarize(w, NOTARY, url, claim))}>notarize</button>
      <TxStatus stage={stage} detail={detail} labels={LABELS} />{msg && <p className="text-sm text-red-400">{msg}</p>}
    </div>
    <div className="card space-y-2">
      <h2 className="font-semibold">Look up a record by ID</h2>
      <div className="flex gap-2"><input className="inp" placeholder="Record ID" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        <button className="btn2" onClick={async () => { setMsg(""); try { setFound(await getRecord(read, NOTARY, Number(lookup))); } catch (e: any) { setFound(null); setMsg(e.message); } }}>get_record</button></div>
      {found && <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs">{JSON.stringify({ ...found, raw: undefined }, null, 2)}</pre>}
    </div>
    <div className="flex flex-wrap gap-2"><input className="inp max-w-xs" placeholder="Search id, URL, claim, submitter" value={q} onChange={(e) => setQ(e.target.value)} />
      {["all", "confirmed", "not_confirmed"].map((k) => <button key={k} className={`btn2 ${vf === k ? "bg-slate-800" : ""}`} onClick={() => setVf(k)}>{k}</button>)}</div>
    {shown.map((r) => (
      <div key={r.id} className="card space-y-2 text-sm">
        <div className="flex justify-between gap-2"><b>Record #{r.id}</b><span className={r.verdict === "confirmed" ? "text-emerald-400" : "text-amber-400"}>{r.verdict}</span></div>
        <p className="break-words text-slate-300">“{r.claim}”</p>
        <a className="break-all text-xs text-indigo-300" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
        <p className="text-xs text-slate-400">AI consensus: {r.reasoning}</p>
        <p className="break-all text-xs text-slate-500">submitter {r.submitter}</p>
        <p className="break-all font-mono text-xs text-slate-500">sha256 {fps[r.id] || "…"}</p>
        <Link className="btn2" href={"/release-gate/?" + new URLSearchParams({ evidence: r.url, record: String(r.id) })}>Use as release-gate challenge evidence →</Link>
        <details className="text-xs text-slate-500"><summary className="cursor-pointer">raw on-chain record</summary><pre className="overflow-auto">{r.raw}</pre></details>
      </div>))}
    {!shown.length && !loadErr && <p className="text-sm text-slate-500">No matching records.</p>}
  </>;
}
