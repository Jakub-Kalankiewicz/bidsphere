# Thesis Validation Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an evidence-based account and compact table of the extended BidSphere validation process to Chapters 6 and 7, then compile and visually verify the thesis PDF.

**Architecture:** Chapter 6 presents the observed validation stages and numeric results. Chapter 7 interprets the methodological value, especially the 17,100-gas storage-state effect, and updates stale limitations so the thesis no longer claims that Sepolia or the application E2E check were not performed. The existing local benchmark remains the primary quantitative experiment.

**Tech Stack:** LaTeX, `tabularx`, `booktabs`, `latexmk`, Poppler (`pdftoppm`, `pdfinfo`).

## Global Constraints

- Do not include commit identifiers, transaction hashes, private configuration, RPC endpoints, wallet data, or artifact checksums in thesis prose or tables.
- Do not call local Hardhat a public blockchain or interpret its fee accounting as real ETH expenditure.
- Present the completed Sepolia validation as a functional public-network test, not by foregrounding the internal label "smoke test".
- State the extended Sepolia counts exactly: 68 planned, 66 confirmed with status 1, one unresolved, one not sent.
- State the matched Hardhat counts exactly: 68/68 confirmed, 12 round aggregates, total 11,576,156 gas.
- Preserve the distinction between the author's manual E2E observation and automated reproducible tests.
- Do not use em dashes or Markdown backticks in LaTeX.
- Table caption goes below the table, followed immediately by `\label`; use `\tablesource{opracowanie własne.}`.

---

### Task 1: Add the validation process and table to Chapter 6

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/6-wyniki.tex`

**Interfaces:**
- Consumes: the approved design and verified values from the preserved raw artifacts.
- Produces: subsection `Rozszerzona walidacja w środowisku lokalnym i sieci Sepolia` and table label `tab:rozszerzona-walidacja`.

- [ ] **Step 1: Insert the subsection after the existing dispersion subsection**

Add prose stating that validation covered the manual E2E application flow, automated verification, a functional Sepolia test, an extended public series, and a topology-matched Hardhat reference.

- [ ] **Step 2: Add the four-row `tabularx` table**

Use columns for stage, scope, result, and role. Include the exact outcomes approved in the design:

```text
Manual E2E: all download/tamper/restore/reverify scenarios behaved as expected.
Sepolia functional test: all planned deployment, registration, read, and verification cases passed.
Extended Sepolia: 68 planned; 66 confirmed; 1 unresolved; 1 not sent.
Matched Hardhat: 68/68 confirmed; 12 aggregates; 11,576,156 gas.
```

- [ ] **Step 3: Add the explanatory paragraph**

Report the completed functional test fee `0,001694256162512503` test ETH. Report the extended confirmed subset as `10911442` gas and `11564875998721838` wei, while making clear that these are confirmed-subset values. Report the matched local total as `11576156` gas and identify its local fee total only as technical Hardhat accounting if included.

- [ ] **Step 4: Run static Chapter 6 checks**

Run:

```bash
rg -n 'tab:rozszerzona-walidacja|Sepolia|11576156|10911442|11564875998721838' tex/6-wyniki.tex
rg -n '[a-f0-9]{40}|—|`' tex/6-wyniki.tex
```

Expected: the new label and values are present; no commit identifier, em dash, or Markdown backtick is introduced.

### Task 2: Interpret the process and correct stale claims in Chapter 7

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/7-dyskusja.tex`

**Interfaces:**
- Consumes: table `tab:rozszerzona-walidacja` from Task 1.
- Produces: a concise methodological interpretation and internally consistent limitations/generalization text.

- [ ] **Step 1: Add a methodological interpretation near the research-question discussion**

Refer to Table `\ref{tab:rozszerzona-walidacja}`. Explain that public execution confirmed functional portability beyond local Hardhat and that the matched reference exposed the effect of contract storage history.

- [ ] **Step 2: Explain the 17,100-gas effect**

State that the first transition of `batchCount` from zero to a nonzero value and subsequent nonzero-to-nonzero transitions differed by exactly 17,100 gas in the controlled check. Explain that the discovery prevented a misleading direct comparison between different storage states.

- [ ] **Step 3: Correct stale statements**

Replace claims that the public Sepolia experiment and full application E2E check were not performed. State instead that the application flow was manually verified, the functional Sepolia test was completed, and the extended public series supplied additional evidence but was not used as a complete five-round comparison. Preserve existing cautions against transferring local timing and gas figures to arbitrary public-network conditions.

- [ ] **Step 4: Run static consistency checks**

Run:

```bash
rg -n 'Sepolia|pełn.*test.*integr|nie został.*wykon|17100|tab:rozszerzona-walidacja' tex/4-implementacja.tex tex/6-wyniki.tex tex/7-dyskusja.tex
rg -n '[a-f0-9]{40}|—|`' tex/6-wyniki.tex tex/7-dyskusja.tex
```

Expected: current-tense claims agree with the executed work; historical descriptions remain clearly historical; no prohibited formatting is introduced.

### Task 3: Correct the stale Chapter 4 environment statement

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`

**Interfaces:**
- Consumes: the completed functional Sepolia validation described in Chapter 6.
- Produces: a configuration section consistent with the final experiment record.

- [ ] **Step 1: Replace the statement that no public experiment was performed**

Keep the architectural explanation that Hardhat and Sepolia use separate chain IDs, addresses, and trust configurations. Replace only the stale execution-status sentence with a forward reference to Chapter 6.

- [ ] **Step 2: Correct the stale E2E limitation sentence if present**

Preserve the distinction between the automated model-level substitution test and the author's manual full application-flow validation.

- [ ] **Step 3: Run static checks**

Run:

```bash
rg -n 'Sepolia|proxy|eksperyment.*nie został' tex/4-implementacja.tex
```

Expected: Chapter 4 no longer contradicts Chapters 6 and 7.

### Task 4: Compile and visually verify the thesis

**Files:**
- Verify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.pdf`
- Verify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.log`

**Interfaces:**
- Consumes: updated Chapters 4, 6, and 7.
- Produces: a current PDF with readable table layout and resolved references.

- [ ] **Step 1: Compile from the thesis root**

Run:

```bash
eval "$(/usr/libexec/path_helper)"
latexmk -pdf -interaction=nonstopmode -file-line-error main.tex
```

Expected: exit code 0.

- [ ] **Step 2: Inspect the log**

Run:

```bash
rg -n 'LaTeX Error|Undefined control sequence|undefined references|undefined citations|Overfull \\hbox|Float too large' main.log
```

Expected: no errors, undefined references/citations, overfull boxes, or oversized floats introduced by the change.

- [ ] **Step 3: Locate and render changed pages**

Use `pdftotext` to locate the new subsection and table in `main.pdf`, then render the containing pages and adjacent pages with `pdftoppm -f <page> -l <page> -png` into `/private/tmp/bidsphere-thesis-validation-render/`.

- [ ] **Step 4: Visually inspect the rendered pages**

Verify that the four-column table is legible, does not cross margins, its caption and source remain attached, and the surrounding paragraph and page break are balanced. Also inspect the relevant list-of-tables page.

- [ ] **Step 5: Final static verification**

Run:

```bash
rg -n '[a-f0-9]{40}|—|`' tex/4-implementacja.tex tex/6-wyniki.tex tex/7-dyskusja.tex
git diff --check 2>/dev/null || true
```

Expected: no newly introduced prohibited strings or whitespace errors. The WUT thesis directory is not a Git repository, so final reporting must list changed files rather than claim a thesis commit.

