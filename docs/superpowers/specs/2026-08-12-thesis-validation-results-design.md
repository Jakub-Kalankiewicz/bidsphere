# Design: presentation of the extended BidSphere validation process

## Goal

Add a concise, positive, and evidence-based account of the extended validation
work to the thesis. The text must show the value of the manual end-to-end
check, public Sepolia functional validation, the extended public series, and
the topology-matched Hardhat reference without describing the interrupted
public series as a completed statistical benchmark.

## Placement

- Chapter 6 receives a new subsection after the existing gas results. It
  describes the validation sequence and contains one compact table.
- Chapter 7 receives a short methodological interpretation. It explains what
  the additional process established and why matching contract storage state
  matters when comparing gas results.
- No other chapter, bibliography entry, screenshot, or figure is added.

## Chapter 6 content

The subsection opens by stating that the prototype was validated at several
levels: manual application flow, automated verification, public test-network
operation, and a controlled matched reference.

The table uses these columns:

1. validation stage;
2. scope;
3. result;
4. role in the evaluation.

It contains four rows:

- manual application E2E: download, tamper, restore, and re-verification; all
  scenarios behaved as expected; confirms the application flow;
- Sepolia functional test: deployment, individual registration, Merkle
  registration, state read, positive verification, and negative verification;
  all planned cases passed; confirms operation in a public test network;
- extended Sepolia series: 68 operations planned, 66 confirmed with status 1,
  one unresolved and one not sent after a receipt timeout; provides additional
  empirical and diagnostic evidence;
- topology-matched Hardhat: two long-lived contracts, 68 operations, one
  warm-up and five recorded rounds per strategy; 68/68 confirmed and 12 round
  aggregates; provides a complete controlled reference.

The accompanying prose may additionally report:

- matched Hardhat total gas: 11,576,156;
- matched Hardhat technical local fee total: 3,378,467,105,384,199 wei, clearly
  identified as a local Hardhat accounting value rather than a public-network
  expenditure;
- the extended Sepolia confirmed subset: 10,911,442 gas and
  11,564,875,998,721,838 wei for 66 confirmed operations;
- the completed Sepolia functional test actual fee:
  0.001694256162512503 test ETH.

Commit identifiers, transaction hashes, private configuration, RPC addresses,
wallet data, and artifact checksums are not copied into thesis prose or tables.

## Chapter 7 interpretation

The discussion emphasizes three results:

1. The public functional test confirmed that deployment, both registration
   strategies, state reading, and verification work outside local Hardhat.
2. The extended public execution supplied real public-network evidence, while
   quantitative conclusions remain based on complete series.
3. Review of the experimental topology found that a fresh-contract local
   observation and a long-lived public contract do not represent the same
   Merkle storage transition. The first and later `batchCount` updates differ
   by 17,100 gas in the controlled Hardhat check. Creating the matched local
   reference therefore improved comparability and prevented a misleading
   direct comparison.

This is presented as methodological value, not merely as a statement that much
time or effort was spent. The wording may say that the extended validation
increased confidence and revealed a previously hidden comparability issue.

## Tone and limits

- Use the term "test funkcjonalny w sieci Sepolia" in the thesis table rather
  than foregrounding the internal label "smoke test".
- State that all planned functional Sepolia cases passed.
- Do not state that all 68 operations of the extended Sepolia series passed.
- Mention the interrupted series once in the table and once in explanatory
  prose; do not repeatedly emphasize incompleteness.
- Do not call local Hardhat a public blockchain or treat local fee accounting
  as a real ETH cost.
- Preserve the distinction between the author's manual E2E observation and
  automated reproducible tests.

## Formatting and verification

- Use a `table` with `tabularx`, `booktabs`, a caption below the table, a label
  directly after the caption, and `Źródło: opracowanie własne` below it.
- Refer to the table in surrounding prose.
- Use no em dash and no Markdown backticks in LaTeX.
- Compile with `latexmk`, inspect errors, undefined references, `Overfull
  \\hbox`, and `Float too large`, then render and visually inspect the changed
  pages and the table-of-contents/list-of-tables consequences.

