# Outside-audit feasibility

Assessed on 2026-11-05. Scope: the public hosted MCP tools, indexer query roots, selected channel, trust root, protocol docs and SDK 0.4.0 registry README. This is not a claim about private validator tooling or every runtime source file.

## Evidence inspected

- [Challenge design](https://docs.flop.network/docs/verification-stack), page updated 2026-10-20. Describes DA retention, one-prefill checks, TOPLOC commitments, bisection and a discretionary bond. Calls the design draft. Encrypted per-turn blobs are a designed next step.
- [Staking and slashing](https://docs.flop.network/docs/staking-and-slashing), page updated 2026-10-20. Describes serve-or-slash and cryptographic fraud evidence. Does not provide an audit retrieval procedure.
- [Session lifecycle](https://docs.flop.network/docs/inference-session-lifecycle), page updated 2026-10-30. States the SOFT end-to-end settlement and dispute lane is still being specified.
- [Protocol parameters](https://docs.flop.network/docs/protocol-parameters), page updated 2026-10-26. Describes approximate challenge duration and draft status. Separates the capacity-bond revocation constant.
- [SDK registry README](https://registry.npmjs.org/@flop-labs%2fsdk), published version 0.4.0, read 2026-11-05. Describes direct sessions, HTLCs, PoUI and agent wallets. No complete discretionary dispute call or canonical evidence encoding is documented there.
- `fixtures/01.sse.base64`: losslessly encoded raw hosted tool schemas. No dedicated audit-blob retrieval or dispute tool appears. Receipt description explicitly says other fields are placeholders and do not establish model or input/output commitments or finalized settlement.
- `fixtures/04.sse`: selected channel `0xa5d0a1722a5c7b8b86d7489ff1e76d0c3eb0a72e39e9c47edee1681ef766deec`. Reports `evidenceStatus: WITNESS_ONLY`, `assuranceTier: Soft` and `observationHead: finalized`. Has settlement call provenance but no turn transcript, DA locator or activation fingerprint payload.
- `fixtures/07.sse`: trust root. Has model hashes and a soft-tier spot-check parameter. It is not per-turn evidence or a runtime dispute call description.
- `fixtures/08.sse`: introspected query roots. Includes compute channels, settlement prices, blocks and reliability. No dedicated DA audit retrieval or bisection query root is exposed. Nested fields were not exhaustively introspected.
- `fixtures/manifest.json`: source `https://mcp.flop.network/mcp`, exact request arguments and capture timestamps for every raw response.

## Feasibility by step

| Step                                    | Possible with inspected public data?                                   | Missing or limit                                                                                                           | Evidence                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Identify settlement and payment split   | Yes, as indexer observations                                           | Independent finalized-state proof                                                                                          | Tape fixtures `02`, `09`, `10`, `11`; channel `04`                                                                                   |
| Estimate a review window                | Yes, as a draft wall-clock estimate                                    | Live runtime constant, challenge start event and eligibility state                                                         | Challenge design; protocol parameters                                                                                                |
| Locate and fetch retained DA audit data | Not demonstrated                                                       | DA endpoint or locator keyed by channel and turn, access method, availability proof and blob schema                        | Channel `04`; tool schemas `01`; query roots `08`; challenge design                                                                  |
| Re-run one prefill                      | Not demonstrated                                                       | Turn tokens or decryptable transcript, exact weight artifact, tokenizer, execution settings and activation sampling recipe | Channel `04`; trust root `07`; challenge design describes one prefill but supplies no reproducible public input bundle               |
| Compare TOPLOC fingerprints             | Not demonstrated                                                       | Fingerprints for the chosen turn, canonical encoding, sample positions, comparison algorithm and accepted tolerance        | Channel `04` contains no fingerprint payload; challenge design describes commitment size rather than a public verification procedure |
| Bisect a disagreement                   | Not demonstrated                                                       | Protocol messages, turn commitments, Merkle paths and round-state access                                                   | Challenge design names bisection; selected public evidence and SDK README do not define its wire format                              |
| Assemble signed turn evidence           | Not demonstrated                                                       | Co-signed transcript leaf, Merkle proof, enclave signature and binding rules                                               | Challenge design names the required evidence; channel `04` does not return it                                                        |
| Submit discretionary dispute            | Not implemented in this tool and not specified by inspected references | Pallet, method, argument types, canonical evidence encoding, runtime qualification and caller eligibility                  | SDK README; lifecycle draft status; read-only tool schemas `01`                                                                      |

The documented bond is 100 FLOP. A frivolous dispute forfeits it. The documented challenger is the paying agent or an active validator. Being able to read the tape does not establish either role.

## Conclusion

An outsider can inspect payment arithmetic and prioritize public settlement observations. The inspected public evidence is insufficient to perform an independent activation re-check or build submission-ready dispute evidence. The dossier stops at those gaps and leaves its extrinsic null. No prefill was run and no dispute was submitted. A reported finalized head, trust-root hash or placeholder receipt does not close these gaps.
