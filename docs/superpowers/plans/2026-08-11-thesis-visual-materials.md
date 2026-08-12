# Thesis Visual Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source-grounded code listings, architecture and result figures, and authentic application screenshots when reproducible to the BidSphere thesis without overstating what was implemented or measured.

**Architecture:** Reuse the existing BidSphere source, generated measurement figures, and local verification UI. Copy only thesis-ready visual assets into the thesis `img/` directory, reference them from the relevant chapters, and add concise captions and source notes. Use `listings` for selected code excerpts and keep screenshots limited to states that can be reproduced from the application or verifier.

**Tech Stack:** LaTeX, `graphicx`, `listings`, SVG-to-PDF/PNG conversion where required, existing Next.js application, existing SVG measurement figures, MacTeX and Poppler for PDF verification.

## Global Constraints

- Use only code, measurements, screens, and diagrams that exist in the BidSphere project or are explicitly derived from them.
- Do not include commit hashes in thesis text, captions, source notes, or work documentation.
- Keep all captions, labels, figure text, and listing comments in Polish.
- Do not present local Hardhat results as public-blockchain measurements.
- Do not present the emulated limited-network profile as a real mobile-network measurement.
- Preserve the existing thesis formatting standard and visually inspect every new figure, listing, and screenshot in the compiled PDF.

---

### Task 1: Record the visual-materials standard

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/writing-and-formatting-standard.md`

- [ ] **Step 1: Add rules for figures, screenshots, listings, and plots**

Record that each visual element needs an informative Polish caption, a unique `fig:` or `lst:` label, an in-text reference, a source note when it is based on own code or data, and a visual PDF check. Record that screenshots must be authentic application states, while plots must be generated from the recorded measurement summaries.

- [ ] **Step 2: Check the standard for hash and em-dash constraints**

Confirm the new section contains no commit hashes and no em dash glyphs.

### Task 2: Prepare reproducible thesis assets

**Files:**
- Create or copy into: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/img/`
- Source: `/Users/jakub.kalankiewicz/Code/personal/bidsphere/measurements/figures/online-time-by-profile.svg`
- Source: `/Users/jakub.kalankiewicz/Code/personal/bidsphere/measurements/figures/gas-per-model-by-batch.svg`
- Source: `/Users/jakub.kalankiewicz/Code/personal/bidsphere/public/verify.html`

- [ ] **Step 1: Inspect existing plot SVGs and verifier UI**

Check dimensions, labels, language, and whether the SVGs render correctly with the thesis toolchain. Check the verifier's positive and negative states before deciding whether screenshots can be captured reproducibly.

- [ ] **Step 2: Create thesis-compatible plot assets**

Copy or convert the existing plots into `img/` without changing measured values. Use a stable filename and retain the original source in the BidSphere project.

- [ ] **Step 3: Capture authentic screenshots when reproducible**

Capture the verifier's successful and failed verification states and, if the protected application can be run with an available fixture, capture the model view with its integrity status. If no real GLB or proof bundle is available, or the capture cannot be verified, omit the screenshot and document the reason rather than fabricating one.

### Task 3: Add selected code listings

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`
- Source: `/Users/jakub.kalankiewicz/Code/personal/bidsphere/contracts/contracts/ModelRegistry.sol`
- Source: `/Users/jakub.kalankiewicz/Code/personal/bidsphere/public/verify-core.mjs`

- [ ] **Step 1: Configure the listings package and style**

Add a restrained `listings` configuration in the preamble for Solidity and JavaScript/TypeScript excerpts, with line wrapping, a small readable font, and Polish captions. Do not include raw secrets, commit hashes, generated TypeChain code, or irrelevant boilerplate.

- [ ] **Step 2: Insert the contract listing**

Include a short excerpt showing the state and registration functions needed to explain individual and Merkle registration. Add a caption, `lst:rejestracja-modeli`, and a paragraph in section 4.3 explaining what the excerpt demonstrates and what it omits.

- [ ] **Step 3: Insert the offline-verifier listing**

Include a short excerpt showing the ordered verification checks in `verify-core.mjs`. Add a caption, `lst:weryfikator-offline`, and a paragraph in section 4.5 connecting the listing to the measured offline path and its limitations.

### Task 4: Add architecture and result figures

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/6-wyniki.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.tex` only if graphic support needs configuration
- Add: architecture figure asset under `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/img/`

- [ ] **Step 1: Create an architecture diagram from the existing four-layer description**

Represent the browser, application proxy, external storage, database, blockchain registry, proof bundle, and offline verifier using a clean vector or PDF/PNG diagram. Do not imply that the smart contract stores model bytes.

- [ ] **Step 2: Reference the architecture figure in section 4.1**

Place the figure after the first complete flow description, add a unique label, and explicitly state that it is a conceptual view of the implemented prototype.

- [ ] **Step 3: Reference the gas and timing plots in chapter 6**

Place the gas-per-model plot next to the gas benchmark discussion and the online/offline timing plot next to the timing discussion. Explain the measured scope in the surrounding text and use the existing tables as the numerical source of record.

### Task 5: Add verifier screenshots when reproducible and update thesis indexes

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`
- Add: screenshot assets under `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/img/`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/state.md`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/session-summary.md`

- [ ] **Step 1: Insert verifier screenshots when authentic fixtures are available**

Add two figures in section 4.5 with captions that identify the state shown. State that the screenshots document the verifier UI and do not constitute additional performance measurements. If authentic fixtures or a stable capture are unavailable, record the omission in the work-state documentation and leave the thesis free of fabricated screenshots.

- [ ] **Step 2: Check figure numbering and lists**

Compile enough times for references and lists to settle. Confirm the list of figures contains every intended figure exactly once and that no screenshot or plot is clipped.

- [ ] **Step 3: Update work-state documentation**

Record the added artifacts, their source paths, and any intentionally omitted screenshot. Preserve the rule that commit hashes are excluded.

### Task 6: Verify the final PDF

**Files:**
- Verify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.pdf`
- Verify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.log`

- [ ] **Step 1: Compile with MacTeX**

Run `latexmk -pdf -interaction=nonstopmode -file-line-error main.tex` from the thesis root until references and lists are stable.

- [ ] **Step 2: Check static build conditions**

Confirm exit code 0, no LaTeX errors, no undefined references, no missing graphics, no `Float too large`, and no duplicated figure-list entries.

- [ ] **Step 3: Render and inspect representative pages**

Render the title page, architecture figure page, both listing pages, screenshot pages, plot pages, list of figures, and pages immediately following each large visual. Check margins, captions, readability, Polish characters, and absence of clipping.

- [ ] **Step 4: Report actual status**

Report only what the fresh compile and visual inspection establish, including any non-blocking warnings that remain.
