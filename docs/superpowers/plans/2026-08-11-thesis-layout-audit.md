# Thesis Layout Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the reported layout defects in the BidSphere thesis while preserving the agreed Polish formatting standard and the measured content.

**Architecture:** Trace each visual defect from the rendered PDF to the responsible LaTeX construct, then apply the smallest local change. Use TikZ geometry for the architecture diagram, `listings` and `\sloppy`-style local containers only where long technical identifiers require them, and `tabularx` or controlled column widths for tables. Recompile and render every changed page before closing the task.

**Tech Stack:** LaTeX, TikZ, `listings`, `tabularx`, `graphicx`, MacTeX, Poppler.

## Global Constraints

- Preserve measured values and source-grounded descriptions.
- Keep captions and source notes in Polish.
- Keep table captions below tables and figure captions below figures.
- Use ASCII hyphens only and do not reintroduce commit hashes.
- Do not fabricate screenshots or experimental data.
- Check the final PDF visually, not only through LaTeX log output.

---

### Task 1: Diagnose the reported layout defects

**Files:**
- Inspect: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`
- Inspect: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/5-metodyka.tex`
- Inspect: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/6-wyniki.tex`
- Inspect: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/7-dyskusja.tex`
- Inspect: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.tex`

- [x] **Step 1: Map each screenshot to its source construct**

Locate the diagram, section headings, listings, tables 4.1 and 6.1--6.5, figure 6.2 and figure 7.1. Record whether the defect is caused by a fixed-width object, a caption placement rule, a table column specification, a long `\texttt{}` token, or an external image.

- [x] **Step 2: Confirm the baseline build and page locations**

Run `latexmk -pdf -interaction=nonstopmode -file-line-error main.tex`, inspect `main.log`, and use `pdfinfo` plus `pdftoppm` on the affected pages. Do not change source files until the baseline symptoms and source locations are identified.

### Task 2: Repair chapter 4 layout

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.tex` only if listing configuration needs a scoped adjustment.

- [x] **Step 1: Redraw crossing diagram edges**

Route arrows around box interiors or between dedicated anchor points so no arrow crosses text. Keep the logical relationships unchanged and retain the figure caption and source note below the diagram.

- [x] **Step 2: Fix heading and technical-token spacing**

Ensure `ModelRegistry` is separated from prose in section 4.3 and add controlled break opportunities around long technical paths such as `public/verify-core.mjs` without changing their meaning.

- [x] **Step 3: Make listing language match the code**

Use `language=Solidity` only for the contract listing and use JavaScript or a supported equivalent for `verify-core.mjs`. Keep the caption explicit about JavaScript if the package language name is only a typesetting mode.

- [x] **Step 4: Keep the verifier listing readable across pages**

Allow a long listing to break only at sensible source lines, ensure its caption remains attached to the listing end, and verify that the split is visually acceptable. If the excerpt can fit on one page after removing nonessential lines, use the smaller excerpt rather than shrinking the whole thesis font.

### Task 3: Repair tables and table conventions

**Files:**
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/4-implementacja.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/6-wyniki.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/7-dyskusja.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.tex` only if a shared table setting is justified.

- [x] **Step 1: Normalize caption placement**

Keep every table caption above its table and every source note below its table. Do not move figure captions into table environments or rely on visual proximity alone.

- [x] **Step 2: Prevent overlapping cells**

Replace fixed-width or incompatible columns in tables 6.1, 6.3 and 6.5 with widths that wrap model and profile names while preserving numeric alignment. Use a small controlled font only inside the affected table if necessary.

- [x] **Step 3: Decide and apply table rules consistently**

Use horizontal rules for header separation and table boundaries. Add vertical rules or row rules only where they materially improve cell association, and apply the same convention to tables 4.1, 6.1, 6.3, 6.4, 6.5 and 7.1.

- [x] **Step 4: Repair table 6.4 source-note placement**

Keep the source note in a full-width block below the table so it cannot be placed beside the final numeric column.

### Task 4: Repair figures and external plot assets

**Files:**
- Inspect or regenerate: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/img/wykres-koszt-gazu.png`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/6-wyniki.tex`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/tex/7-dyskusja.tex`

- [x] **Step 1: Verify figure 6.2 rendering**

Determine whether the apparent missing lines are part of the source chart or a rasterization problem. Preserve the measured points and labels, but regenerate the asset only if the chart is genuinely missing required grid or axis lines.

- [x] **Step 2: Prevent figure 7.1 clipping**

Fit the complete chart inside the page box using a stable width or height, and keep its caption and source note below it. Verify the page immediately after the figure for continuity.

### Task 5: Verify and document

**Files:**
- Verify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/main.pdf`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/writing-and-formatting-standard.md`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/state.md`
- Modify: `/Users/jakub.kalankiewicz/Code/personal/WUT_Thesis/thesis-work/session-summary.md`

- [x] **Step 1: Compile and inspect all affected pages**

Run the LaTeX build until references and lists are stable. Render the diagram, section 4.3, listing pages, table 4.1, tables 6.1, 6.3--6.5, figure 6.2, and figure 7.1. Check for clipping, overlap, caption position, readable paths, and consistent margins.

- [x] **Step 2: Run static checks**

Confirm no fatal LaTeX errors, undefined references, missing graphics, duplicate labels, em dash glyphs, or literal commit hashes were introduced.

- [x] **Step 3: Update the standard and work log**

Record the table rule, long-identifier, diagram-edge, listing-language, and figure-sizing conventions so later edits use the same format. Record any deliberate decision such as retaining a multi-page listing or a chart without internal grid lines.
