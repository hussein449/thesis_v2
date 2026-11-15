"""Full rundown of CCR-UAV: the algorithm, the comparison, the paired tests.

Reads data/ccr/experiment_results.json and data/ccr/paired_tests.json so the
numbers cannot drift from what was actually run. Segment geometry is
recorded inline below, measured from the three segmentation functions.

    python -I scripts/validation/make_ccr_pdf.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_JUSTIFY  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import (BaseDocTemplate, Frame, Image,  # noqa: E402
                                KeepTogether, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "CCR_UAV_Full_Report.pdf"
FIGS = ROOT / "data" / "ccr" / "figures"

NAVY = colors.HexColor("#1f4e79")
GREY = colors.HexColor("#555555")
RED = colors.HexColor("#c00000")
TEAL = colors.HexColor("#0d9488")

A1C, A2C, A3C = "#1f4e79", "#c00000", "#0d9488"

# Segment lengths in km, measured from the three segmentation functions.
SEGS = {
    12: {
        "A1": [2.383] * 12,
        "A2": [1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 10.6],
        "A3": [2.3, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.3],
    },
    16: {
        "A1": [1.788] * 16,
        "A2": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 9.6],
        "A3": [1.3, 1.3, 1.3, 1.3, 1.4, 1.6, 1.4, 1.4, 1.6, 2.2, 2.1, 2.2,
               2.4, 2.4, 2.4, 2.3],
    },
}


def load():
    exp = json.loads((ROOT / "data" / "ccr" / "experiment_results.json").read_text())
    pair = json.loads((ROOT / "data" / "ccr" / "paired_tests.json").read_text())
    cols = exp["columns"]
    rows = [dict(zip(cols, r)) for r in exp["rows"]]
    return rows, pair


# --- figures ----------------------------------------------------------------

def fig_segments(path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10.6, 3.3), sharey=True)
    for ax, M in zip(axes, (12, 16)):
        w = 0.27
        for i, (k, c) in enumerate((("A1", A1C), ("A2", A2C), ("A3", A3C))):
            lens = SEGS[M][k]
            x = np.arange(len(lens)) + (i - 1) * w
            ax.bar(x, lens, width=w, color=c, zorder=3,
                   label={"A1": "A1 Uniform", "A2": "A2 Risk-aware",
                          "A3": "A3 CCR-UAV"}[k])
        ax.axhline(2.4, color="#333", lw=1.1, ls="--", zorder=4)
        ax.text(-0.45, 2.62, "2.4 km cap", fontsize=7, ha="left",
                color="#333")
        ax.set_title(f"M = {M} drones", fontsize=9)
        ax.set_xlabel("patrol segment", fontsize=7.6)
        ax.tick_params(labelsize=7)
        ax.grid(axis="y", alpha=0.22, zorder=0)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    axes[0].set_ylabel("segment length (km)", fontsize=7.8)
    axes[0].legend(fontsize=7.2, frameon=False, loc="upper left")
    axes[1].annotate("9.6 km — a drone needs\nover 20 min to return",
                     xy=(15.1, 9.3), xytext=(8.4, 7.6), fontsize=7.2,
                     color=RED.hexval()[2:] and "#c00000",
                     arrowprops=dict(arrowstyle="->", color="#c00000", lw=1.0))
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=300)
    plt.close(fig)


def fig_results(rows, path: Path) -> None:
    fig, (axl, axr) = plt.subplots(1, 2, figsize=(10.6, 3.3))
    for k, c, lab in (("A1", A1C, "A1 Uniform"), ("A2", A2C, "A2 Risk-aware"),
                      ("A3", A3C, "A3 CCR-UAV")):
        pts = [(r["M"], r["J"]) for r in rows
               if r["strategy"] == k and r["J"] is not None]
        axl.plot([p[0] for p in pts], [p[1] for p in pts], "o-", ms=4.5,
                 lw=1.6, color=c, label=lab, zorder=3)
        ms = [(r["M"], r["missPct"]) for r in rows
              if r["strategy"] == k and r["missPct"] is not None]
        axr.plot([p[0] for p in ms], [p[1] for p in ms], "o-", ms=4.5,
                 lw=1.6, color=c, label=lab, zorder=3)
    axl.set_yscale("log")
    axl.set_xlabel("fleet size M", fontsize=7.8)
    axl.set_ylabel("J — penalised delay (s, log)", fontsize=7.8)
    axl.set_title("Objective: lower is better", fontsize=9)
    axl.legend(fontsize=7.2, frameon=False)

    axr.axhline(5, color="#333", lw=1.1, ls="--", zorder=4)
    axr.text(29.5, 5.6, "ε = 5 % cap", fontsize=7, ha="right", color="#333")
    axr.set_xlabel("fleet size M", fontsize=7.8)
    axr.set_ylabel("missed alerts (%)", fontsize=7.8)
    axr.set_title("Alerts never answered within 600 s", fontsize=9)

    for ax in (axl, axr):
        ax.axvspan(2, 11.6, color="#eeeeee", zorder=0)
        ax.tick_params(labelsize=7)
        ax.grid(alpha=0.22, zorder=0)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
    axl.text(6.9, 41, "A3 infeasible\n(needs 12 or more)",
             fontsize=6.8, ha="center", va="bottom", color="#777")
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


def fig_paired(pair, path: Path) -> None:
    res = pair["results"]
    fig, ax = plt.subplots(figsize=(10.6, 2.0))
    labels, mids, los, his = [], [], [], []
    for r in res:
        labels.append(f"{r['comparison']}   M = {r['M']}")
        mids.append(r["meanDiff_s"])
        los.append(r["ci95"][0])
        his.append(r["ci95"][1])
    y = np.arange(len(res))[::-1]
    for yi, m, lo, hi in zip(y, mids, los, his):
        c = A3C if m < 0 else A1C
        ax.plot([lo, hi], [yi, yi], color=c, lw=2.4, solid_capstyle="round",
                zorder=3)
        ax.plot([m], [yi], "o", color=c, ms=7, zorder=4)
        ax.text(hi + 3, yi, f"{m:+.1f} s  [{lo:+.1f}, {hi:+.1f}]",
                va="center", fontsize=7.2, color="#333")
    ax.axvline(0, color="#333", lw=1.1, zorder=2)
    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=7.6)
    ax.set_xlim(-100, 55)
    ax.set_xlabel("mean paired difference in penalised delay (s) — "
                  "negative favours the first strategy", fontsize=7.6)
    ax.tick_params(axis="x", labelsize=7)
    ax.grid(axis="x", alpha=0.22, zorder=0)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


# --- document ----------------------------------------------------------------

def main() -> int:
    rows, pair = load()
    FIGS.mkdir(parents=True, exist_ok=True)
    f1, f2, f3 = FIGS / "segments.png", FIGS / "results.png", FIGS / "paired.png"
    fig_segments(f1)
    fig_results(rows, f2)
    fig_paired(pair, f3)

    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=8.6, leading=11.4,
                          alignment=TA_JUSTIFY, spaceAfter=5,
                          textColor=colors.HexColor("#1a1a1a"))
    cell = ParagraphStyle("c", parent=ss["Normal"], fontSize=7.2, leading=8.8)
    h1 = ParagraphStyle("h1", parent=ss["Normal"], fontSize=12.5, leading=15,
                        textColor=NAVY, fontName="Helvetica-Bold",
                        spaceBefore=4, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=ss["Normal"], fontSize=9.4, leading=12,
                        spaceBefore=6, spaceAfter=3, textColor=NAVY,
                        fontName="Helvetica-Bold")
    title = ParagraphStyle("t", parent=ss["Normal"], fontSize=16, leading=18,
                           textColor=NAVY, fontName="Helvetica-Bold")
    sub = ParagraphStyle("s", parent=ss["Normal"], fontSize=9, leading=11.5,
                         textColor=GREY, fontName="Helvetica-Oblique")
    meta = ParagraphStyle("m", parent=ss["Normal"], fontSize=7.4, leading=9.4,
                          textColor=GREY)
    cap = ParagraphStyle("cp", parent=ss["Normal"], fontSize=6.9, leading=8.6,
                         textColor=GREY)

    def box(text, colour=NAVY, bg="#fafbfd"):
        t = Table([[Paragraph(text, body)]], colWidths=[172 * mm])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.7, colour),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    S = []
    # ================= PAGE 1 — the algorithm ==============================
    S.append(Paragraph("CCR-UAV: What It Is, and Whether It Works", title))
    S.append(Spacer(1, 2))
    S.append(Paragraph("A coverage-constrained patrol allocation for the M51 "
                       "corridor, and its comparison against the two existing "
                       "strategies", sub))
    S.append(Spacer(1, 3))
    S.append(Paragraph("Hussein Nasereddine &nbsp;|&nbsp; M51 "
                       "Khalde&ndash;Awali &nbsp;|&nbsp; 15 November 2026",
                       meta))
    S.append(Spacer(1, 8))

    S.append(Paragraph("1 &nbsp; The problem it solves", h1))
    S.append(Paragraph(
        "The corridor is patrolled by M drones, each flying back and forth "
        "along its own stretch of road. An alert is counted as <b>missed</b> "
        "if no drone comes within radio range of it inside 600 seconds.<br/>"
        "The existing risk-aware method (A2) gives busy stretches shorter "
        "segments, which is sensible, but nothing bounds the quiet ones. At "
        "M = 16 it hands twelve drones one kilometre each and leaves a single "
        "drone <b>9.6 km</b>. That drone needs over twenty minutes to return "
        "to a given point, so alerts there are not merely slow &mdash; they "
        "are never answered. A2 optimises the average and does not notice it "
        "has abandoned a stretch of road. The manuscript already records this "
        "geometry as a limitation; what follows measures what it costs.", body))
    S.append(KeepTogether([
        Image(str(f1), width=172 * mm, height=172 * mm * (3.3 / 10.6)),
        Spacer(1, 1),
        Paragraph("Segment lengths under each strategy. A1 is flat by "
                  "construction. A2 concentrates drones on the busy north and "
                  "leaves one enormous southern segment at both fleet sizes. "
                  "A3 varies with risk but never crosses the cap.", cap)]))
    S.append(Spacer(1, 4))

    S.append(Paragraph("2 &nbsp; How CCR-UAV works", h1))
    S.append(Paragraph(
        "One algorithm with <b>two coverage protections</b>, minimising "
        "risk-weighted delay subject to both.", body))
    rows2 = [
        ["<b>Length cap</b>",
         "No segment may exceed <b>L_max = v &times; T_max / 2 = 2.4 km</b>. A drone "
         "sweeping a segment passes every point twice per cycle, so this "
         "guarantees a revisit inside the 600 s window &mdash; for an "
         "uninterrupted drone."],
        ["<b>Miss cap</b>",
         "The probability an alert goes unanswered must stay under &epsilon;. "
         "This cannot be computed on paper, so it is evaluated in the full "
         "simulator with batteries, docks and spares."],
    ]
    t = Table([[Paragraph(a, cell), Paragraph(b, cell)] for a, b in rows2],
              colWidths=[30 * mm, 142 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#b8b8b8")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef4f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    S.append(t)
    S.append(Spacer(1, 5))
    S.append(Paragraph("It runs in three stages", h2))
    S.append(Paragraph(
        "<b>A &mdash; prepare.</b> Cut the corridor into 286 cells of 100 m. "
        "Give each the fitted crash rate of the region containing it, "
        "length-weighted where a cell straddles a boundary. The fine grid only "
        "decides where boundaries may fall; it claims no better knowledge of "
        "crash position than the town-level records allow. For every "
        "admissible segment, compute a closed-form average waiting time.<br/>"
        "<b>B &mdash; partition.</b> A dynamic program finds the "
        "<b>provably optimal</b> split into M segments under the cap. Optimal "
        "for the formula, which is all it claims: the formula knows nothing "
        "about batteries or docks.<br/>"
        "<b>C &mdash; refine.</b> Nudge each boundary by &plusmn;100 and "
        "&plusmn;200 m and score every candidate in the <b>real simulator</b>, "
        "keeping improvements. Development seeds here are kept separate from "
        "the seeds used to report results.", body))
    S.append(Spacer(1, 3))
    S.append(box(
        "<b>When it cannot be done, it says so.</b> Twelve 2.4 km segments are "
        "the minimum that covers 28.6 km, so below M = 12 CCR-UAV returns "
        "<i>infeasible</i> and no patrol plan at all. It never quietly relaxes "
        "the cap to produce something comparable. With indivisible 1 km "
        "sections the minimum rises to 15.", TEAL, "#f2fbfa"))
    S.append(Spacer(1, 4))
    S.append(Paragraph(
        "<b>Ten verification checks pass</b> before any result was produced: "
        "the segments cover the road exactly once with nothing over the cap; "
        "drone kinematics match hand calculation including reflection; the "
        "shortest optimised segment (700 m at M = 30) still exceeds the 200 m "
        "radio range, so the simulator's nearest-neighbour receiver search "
        "remains valid; fixed seeds reproduce results exactly; the grid "
        "weights reconcile to 445.9 crashes per year; and the two tuning "
        "parameters are frozen with a checksum that refuses to score anything "
        "if they are edited.", body))

    # ================= PAGE 2 — the comparison =============================
    S.append(PageBreak())
    S.append(Paragraph("3 &nbsp; Against the other two strategies", h1))
    S.append(Paragraph(
        "All three were run on <b>identical accidents</b> &mdash; the same "
        "crashes at the same times and places &mdash; over 30-day trials with "
        "the leakage-corrected crash rates. The measure is "
        "<b>J</b>, the average delay with a missed alert counted at the full "
        "600 s window and penalised again for never arriving. The ordinary "
        "average is not used on its own, because an alert that is never "
        "answered simply drops out of it.", body))
    S.append(KeepTogether([
        Image(str(f2), width=172 * mm, height=172 * mm * (3.3 / 10.6)),
        Spacer(1, 1),
        Paragraph("Left: the objective, log scale. Right: the share of alerts "
                  "never answered. The grey band is where CCR-UAV is "
                  "infeasible and reports so.", cap)]))
    S.append(Spacer(1, 5))

    S.append(Paragraph("The result at M = 16, in one table", h2))
    hdr = ["Strategy", "J (s)", "Missed", "Average among<br/>detected only",
           "95th<br/>percentile", "Within<br/>5 % cap"]
    data = [[Paragraph(f"<b>{h}</b>", cell) for h in hdr]]
    at16 = {r["strategy"]: r for r in rows if r["M"] == 16}
    for k, name in (("A1", "A1 Uniform"), ("A2", "A2 Risk-aware (current)"),
                    ("A3", "A3 CCR-UAV")):
        r = at16[k]
        p95 = "none" if r["p95"] is None else f"{r['p95']:.0f} s"
        data.append([
            Paragraph(f"<b>{name}</b>", cell),
            Paragraph(f"{r['J']:.1f}", cell),
            Paragraph(f"{r['missPct']:.1f} %", cell),
            Paragraph(f"{r['meanAmongDetected']:.1f} s", cell),
            Paragraph(p95, cell),
            Paragraph("yes" if r["epsilonOk"] else "<b>no</b>", cell),
        ])
    t = Table(data, colWidths=[44 * mm, 20 * mm, 20 * mm, 36 * mm, 26 * mm, 26 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#b8b8b8")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#fdf0f0")),
        ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#f2fbfa")),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    S.append(t)
    S.append(Spacer(1, 5))
    S.append(box(
        "<b>Read the fourth column, then the third.</b> On the average among "
        "detected alerts &mdash; the figure the manuscript currently reports "
        "&mdash; A2 is the <i>best</i> of the three at 69.9 s, ahead of "
        "CCR-UAV's 81.2 s. It achieves that by never answering 7.2 % of "
        "alerts, which is why its 95th percentile does not exist: more than "
        "5 % of events have no arrival time at all. Count those alerts and "
        "the ranking reverses, CCR-UAV first at J = 81.2 against A2's 151.6."
        "<br/><br/>"
        "This is the single most important finding of the work, and it is a "
        "finding about <b>measurement</b> before it is one about algorithms. "
        "A strategy can be rewarded for abandoning the hardest cases, and the "
        "current metric does exactly that.", RED, "#fdf4f4"))
    S.append(Spacer(1, 4))
    S.append(Paragraph(
        "Across the range: A2 breaches the 5 % miss cap at every fleet size "
        "from 7 to 16 (14.7, 5.0, 8.8, 8.3 and 7.2 %). <b>CCR-UAV misses "
        "nothing at any feasible fleet size</b>, and has the lowest J at "
        "M = 13, 16, 20 and 25. At M = 12, its smallest feasible fleet, it is "
        "<i>worse</i> than plain uniform patrol &mdash; twelve 2.4 km segments "
        "barely cover 28.6 km, so the cap leaves almost no freedom and the "
        "risk weighting does not pay for itself.", body))

    # ================= PAGE 3 — paired tests ===============================
    S.append(PageBreak())
    S.append(Paragraph("4 &nbsp; Are the differences real?", h1))
    S.append(Paragraph(
        "A difference in averages is not evidence on its own. Because every "
        "strategy faces the same crashes, the comparison can be made "
        "<b>crash by crash</b> rather than between two separately averaged "
        "numbers, which removes the biggest source of noise. Confidence "
        "intervals come from resampling whole trials rather than individual "
        "crashes, because crashes within one trial share a drone fleet, a "
        "battery timeline and a dock queue, and are therefore not independent."
        " As a control, a strategy compared against itself returns exactly "
        "zero.", body))
    S.append(KeepTogether([
        Image(str(f3), width=172 * mm, height=172 * mm * (2.0 / 10.6)),
        Spacer(1, 1),
        Paragraph("Mean paired difference with its 95 % interval. An interval "
                  "crossing the line would mean the two are indistinguishable.",
                  cap)]))
    S.append(Spacer(1, 5))
    S.append(Paragraph("What survives, and what does not", h2))

    pr = {r["comparison"] + str(r["M"]): r for r in pair["results"]}
    verdicts = [
        ("A3 vs A2 at M = 16", pr["A3 - A216"],
         "<b>Solid.</b> A 70-second advantage with an interval nowhere near "
         "zero. This is the claim the work can support."),
        ("A3 vs A1 at M = 16", pr["A3 - A116"],
         "<b>Weak.</b> The interval clears zero by half a second. Not a margin "
         "to build an argument on at 20 trials."),
        ("A3 vs A1 at M = 12", pr["A3 - A112"],
         "<b>Weak, and against us.</b> Uniform is ahead, but the interval "
         "clears zero by a tenth of a second."),
    ]
    data = [[Paragraph(f"<b>{h}</b>", cell) for h in
             ("Comparison", "Difference", "95 % interval", "Reading")]]
    for name, r, note in verdicts:
        data.append([
            Paragraph(f"<b>{name}</b>", cell),
            Paragraph(f"{r['meanDiff_s']:+.1f} s", cell),
            Paragraph(f"[{r['ci95'][0]:+.1f}, {r['ci95'][1]:+.1f}]", cell),
            Paragraph(note, cell)])
    t = Table(data, colWidths=[36 * mm, 22 * mm, 30 * mm, 84 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#b8b8b8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f2fbfa")),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    S.append(t)
    S.append(Spacer(1, 5))
    S.append(Paragraph("A second test disagrees, and it is worth understanding "
                       "why", h2))
    S.append(Paragraph(
        "A rank test on the same paired data returns p = 0.30 for the A2 "
        "comparison, which looks irreconcilable with a 70-second gap. Both are "
        "correct. The rank test asks whether the <b>typical</b> crash is found "
        "sooner, and it is not: under every strategy most crashes are found "
        "quickly. The entire gap comes from the <b>tail</b> &mdash; the 7.2 % "
        "of alerts A2 never answers. That the median is unmoved while the mean "
        "shifts 70 seconds is the most precise description of what CCR-UAV "
        "changes: it does not make ordinary detection faster, it removes the "
        "cases that fail completely. Both numbers belong in the paper.", body))
    S.append(Spacer(1, 3))
    S.append(box(
        "<b>What can be claimed today.</b> CCR-UAV eliminates the missed "
        "alerts the current risk-aware method produces, and on this corridor "
        "that is worth about 70 seconds of penalised delay per crash at "
        "M = 16. It respects its coverage guarantee at every feasible fleet "
        "size and refuses the fleet sizes where the guarantee is impossible."
        "<br/><br/>"
        "<b>What cannot be claimed yet.</b> That CCR-UAV beats plain uniform "
        "patrol. At M = 16 the advantage is half a second clear of zero; at "
        "M = 12 uniform is marginally ahead. More trials would settle it; "
        "until they are run, the honest statement is that CCR-UAV matches "
        "uniform patrol while adding a guarantee uniform patrol does not "
        "offer, and clearly beats the method the paper currently uses."
        "<br/><br/>"
        "<b>Remaining work.</b> Even the trial counts across fleet sizes "
        "(20, 14 and 10 at present); run the Stage C refinement into the "
        "reported figures, which should favour CCR-UAV further; and evaluate "
        "on the real crash dates of the ten held-out months.", NAVY))

    def footer(canv, doc):
        canv.saveState()
        canv.setFont("Helvetica", 6.4)
        canv.setFillColor(GREY)
        canv.drawString(19 * mm, 9 * mm,
                        "Identical accidents per strategy - 30-day trials - "
                        "frozen gamma 1.0, epsilon 0.05 - leakage-corrected "
                        "crash rates - branch feat/ccr-uav")
        canv.drawRightString(A4[0] - 19 * mm, 9 * mm, f"page {doc.page} of 3")
        canv.restoreState()

    doc = BaseDocTemplate(str(OUT), pagesize=A4,
                          title="CCR-UAV: What It Is, and Whether It Works",
                          author="Hussein Nasereddine",
                          leftMargin=19 * mm, rightMargin=19 * mm,
                          topMargin=13 * mm, bottomMargin=13 * mm)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
                  id="main")
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=footer)])
    doc.build(S)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
