# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *


class AINotary(gl.Contract):
    """
    AI Notary — an Intelligent Contract that verifiably records whether
    specific content existed on a given web page at the time of notarization.

    Use cases:
    - Proof that a freelancer published/delivered work at a URL
    - Proof that a website displayed certain terms/prices at a point in time
    - Any "this content existed online at time X" dispute

    How it works:
    1. Anyone calls `notarize(url, claim)` with a page URL and a text claim
       they want verified (e.g. an exact phrase, a price, a statement).
    2. The contract fetches the page and asks the LLM to judge whether the
       claim is genuinely supported by the page content — semantic matches
       are allowed, not just verbatim substrings.
    3. Validators reach consensus on the verdict via the comparative
       Equivalence Principle.
    4. A permanent record (id, url, claim, verdict, reasoning, submitter)
       is stored on-chain and can never be altered — only appended.

    Known limitation:
    The web renderer fetches page content without waiting for full
    client-side JavaScript hydration. This means AI Notary works reliably
    for static or server-rendered (SSR) pages, but heavy client-side
    single-page apps (e.g. plain React/Vite SPAs) may render before their
    real content loads, producing false "not_confirmed" results even when
    the claim is genuinely on the page. Prefer notarizing SSR/static pages,
    or pages where the claimed content is present in the initial HTML.
    """

    records: DynArray[str]

    def __init__(self):
        pass

    @gl.public.write
    def notarize(self, url: str, claim: str) -> None:
        assert len(url) > 0, "URL cannot be empty"
        assert len(claim) > 0, "Claim cannot be empty"

        def verify_claim() -> str:
            page_text = gl.nondet.web.render(url, mode="text")
            page_text = page_text[:12000]

            prompt = f"""
You are an independent web-content verification agent.

Your task is to determine whether a specific claim is genuinely
supported by the supplied web page content.

IMPORTANT:
- Do not rely on outside knowledge.
- Use ONLY the supplied page content.
- Semantic matches are allowed.
- The claim does not need to appear word-for-word.
- Do not assume facts that are not supported by the page.
- If the evidence is insufficient, return "not_confirmed".
- Be conservative.

CLAIM:
{claim}

WEB PAGE CONTENT:
{page_text}

Return ONLY valid JSON in exactly this structure:
{{"verdict": "confirmed" or "not_confirmed", "reasoning": "one short sentence"}}
"""
            result = gl.nondet.exec_prompt(prompt)
            result = result.replace("```json", "").replace("```", "").strip()

            parsed = json.loads(result)
            normalized = {
                "verdict": parsed.get("verdict", "not_confirmed"),
                "reasoning": parsed.get("reasoning", ""),
            }
            return json.dumps(normalized, sort_keys=True)

        consensus_result = gl.eq_principle.prompt_comparative(
            verify_claim,
            principle="The verdict field must be exactly the same.",
        )

        parsed_result = json.loads(consensus_result)

        record = {
            "id": len(self.records),
            "url": url,
            "claim": claim,
            "verdict": parsed_result.get("verdict", "not_confirmed"),
            "reasoning": parsed_result.get("reasoning", ""),
            "submitter": str(gl.message.sender_address),
        }

        self.records.append(json.dumps(record, sort_keys=True))

    @gl.public.view
    def get_record(self, record_id: int) -> str:
        assert 0 <= record_id < len(self.records), "Invalid record ID"
        return self.records[record_id]

    @gl.public.view
    def get_all_records(self) -> list[str]:
        return list(self.records)

    @gl.public.view
    def total_records(self) -> int:
        return len(self.records)
