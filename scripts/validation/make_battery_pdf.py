"""One-page note: the revised UAV battery and docking model, old vs new.

MEASUREMENTS. Every number below was produced by running the two versions of
the simulator from the running dev server and reading the results back:

  detection metrics  simulateOnce(), M drones, uniform patrol, 20 seeds each,
                     30-day trials, M51 corridor
  coverage metrics   simulateBatteryDocking({M, rho: 0.2, mode: 'uniform'}),
                     deterministic, no seeds
  off-station time   simulateBatteryTrace(), 12 h, 5 s sampling, 175 cycles

"OLD" was measured on `main` (commit 806c1f6); "NEW" on branch
feat/dock-stations-battery-swap after 69eb090. They are recorded here rather
than recomputed so the page is reproducible without a browser; re-measure
with the same calls if the model changes again.

    python -I scripts/validation/make_battery_pdf.py
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
                                KeepTogether, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parents[2]
OUT_PDF = ROOT / "Battery_Docking_Model_Revision.pdf"
OUT_JSON = ROOT / "data" / "validation" / "battery_comparison.json"
FIG = ROOT / "data" / "validation" / "figures" / "battery_model.png"

NAVY = colors.HexColor("#1f4e79")
GREY = colors.HexColor("#555555")
RED = colors.HexColor("#c00000")
GREEN = colors.HexColor("#1f7a1f")

M = [3, 5, 10, 16]
DATA = {
    "uncovered_avg_pct": {"old": [35.11, 42.47, 42.85, 40.63],
                          "new": [0.82, 0.28, 1.11, 1.51]},
    "uncovered_max_pct": {"old": [38.54, 43.20, 47.13, 44.62],
                          "new": [1.77, 0.56, 2.21, 2.14]},
    "off_station_s": {"old": {"ferry": 60, "dwell": 240, "return": 0},
                      "new": {"ferry": 85, "dwell": 120, "return": 5}},
    "at_M10": {"mean_alert_s": {"old": 170.2, "new": 173.8},
               "availability_pct": {"old": 94.3, "new": 96.7},
               "missed_pct": {"old": 0.13, "new": 0.13}},
    "battery_floor_pct_new": 13.2,
}


def figure(path: Path) -> None:
    fig, (axl, axr) = plt.subplots(
        1, 2, figsize=(10.6, 3.5), gridspec_kw={"width_ratios": [1.25, 1]})

    # --- left: uncovered fraction, log scale -------------------------------
    x = np.arange(len(M))
    old = DATA["uncovered_avg_pct"]["old"]
    new = DATA["uncovered_avg_pct"]["new"]
    axl.bar(x - 0.2, old, width=0.4, color="#c00000", label="old model", zorder=3)
    axl.bar(x + 0.2, new, width=0.4, color="#1f4e79", label="new model", zorder=3)
    for xi, v in zip(x - 0.2, old):
        axl.text(xi, v * 1.12, f"{v:.0f}%", ha="center", fontsize=7.4, color="#c00000")
    for xi, v in zip(x + 0.2, new):
        axl.text(xi, v * 1.12, f"{v:.1f}%", ha="center", fontsize=7.4, color="#1f4e79")
    axl.set_yscale("log")
    axl.set_ylim(0.15, 160)
    axl.set_xticks(x)
    axl.set_xticklabels([f"M = {m}" for m in M], fontsize=7.8)
    axl.set_ylabel("segment time uncovered (%, log scale)", fontsize=7.6)
    axl.tick_params(axis="y", labelsize=7.2)
    axl.set_title("Coverage gaps — how much of the day a segment has no drone",
                  fontsize=8.6)
    axl.legend(fontsize=7.4, frameon=False, ncol=2, loc="upper left")
    axl.grid(axis="y", alpha=0.22, zorder=0, which="both")
    for s in ("top", "right"):
        axl.spines[s].set_visible(False)

    # --- right: where the off-station time goes ----------------------------
    o, n = DATA["off_station_s"]["old"], DATA["off_station_s"]["new"]
    y = [1, 0]
    ferry = [o["ferry"], n["ferry"]]
    dwell = [o["dwell"], n["dwell"]]
    back = [o["return"], n["return"]]
    axr.barh(y, ferry, color="#8ab4d8", height=0.45, zorder=3, label="ferry out")
    axr.barh(y, dwell, left=ferry, color="#c00000", height=0.45, zorder=3,
             label="at the dock")
    axr.barh(y, back, left=np.add(ferry, dwell), color="#5b9bd5", height=0.45,
             zorder=3, label="ferry back")
    axr.text(o["ferry"] + o["dwell"] + 8, 1, "300 s", va="center", fontsize=8,
             color="#c00000")
    axr.text(sum(n.values()) + 8, 0, "210 s", va="center", fontsize=8,
             color="#1f4e79")
    axr.text(o["ferry"] / 2, 1.33, "60 s flat\nfrom anywhere", ha="center",
             fontsize=6.6, color="#555")
    axr.text(o["ferry"] + o["dwell"] / 2, 1.33, "240 s charge", ha="center",
             fontsize=6.6, color="#555")
    axr.text(n["ferry"] / 2, -0.36, "real distance", ha="center", fontsize=6.6,
             color="#555")
    axr.text(n["ferry"] + n["dwell"] / 2, -0.36, "120 s swap", ha="center",
             fontsize=6.6, color="#555")
    axr.set_yticks(y)
    axr.set_yticklabels(["old model", "new model"], fontsize=8)
    axr.set_xlim(0, 400)
    axr.set_ylim(-0.75, 1.75)
    axr.set_xlabel("mean time a drone is off its segment (s)", fontsize=7.6)
    axr.tick_params(axis="x", labelsize=7.2)
    axr.set_title("Where that time goes", fontsize=8.6)
    axr.legend(fontsize=6.9, frameon=False, ncol=3, loc="lower right")
    axr.grid(axis="x", alpha=0.22, zorder=0)
    for s in ("top", "right", "left"):
        axr.spines[s].set_visible(False)

    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=300)
    plt.close(fig)


def main() -> int:
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({"fleet_sizes": M, **DATA}, indent=2) + "\n")
    figure(FIG)

    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontSize=8.0, leading=10.2,
                          alignment=TA_JUSTIFY,
                          textColor=colors.HexColor("#1a1a1a"))
    cell = ParagraphStyle("c", parent=ss["Normal"], fontSize=6.9, leading=8.4)
    h2 = ParagraphStyle("h", parent=ss["Normal"], fontSize=8.8, leading=11,
                        spaceAfter=2.5, textColor=NAVY,
                        fontName="Helvetica-Bold")
    title = ParagraphStyle("t", parent=ss["Normal"], fontSize=15, leading=17,
                           textColor=NAVY, fontName="Helvetica-Bold")
    sub = ParagraphStyle("s", parent=ss["Normal"], fontSize=8.6, leading=11,
                         textColor=GREY, fontName="Helvetica-Oblique")
    meta = ParagraphStyle("m", parent=ss["Normal"], fontSize=7.2, leading=9,
                          textColor=GREY)
    cap = ParagraphStyle("cp", parent=ss["Normal"], fontSize=6.6, leading=8.2,
                         textColor=GREY)

    S = []
    S.append(Paragraph("Revised UAV Battery and Docking Model", title))
    S.append(Spacer(1, 2))
    S.append(Paragraph("Docking stations along the corridor, real ferry "
                       "distances, and battery swap in place of charging", sub))
    S.append(Spacer(1, 3))
    S.append(Paragraph("Hussein Nasereddine &nbsp;|&nbsp; M51 "
                       "Khalde&ndash;Awali corridor &nbsp;|&nbsp; "
                       "15 November 2026", meta))
    S.append(Spacer(1, 7))

    S.append(Paragraph("Why the old model had to change", h2))
    S.append(Paragraph(
        "Three faults, none of which changed the headline results much, but all "
        "of which a reader can check. <b>(1)</b> Docking was a flat 60 s ferry "
        "from anywhere on a 28.6 km corridor, so where a drone happened to be "
        "when its battery ran low made no difference. <b>(2)</b> The battery "
        "did not drain during that ferry &mdash; the flight to the dock was "
        "free. <b>(3)</b> Redeploy was gated on <i>both</i> 80 % charge and a "
        "240 s floor; since a pack refilled from 25 % to 100 % in 180 s, the "
        "240 s always bound and the 80 % rule quoted in the manuscript never "
        "governed anything. The separate fleet-availability model was worse "
        "still: it recharged at 1 %/min, so refilling a pack took "
        "<b>95 minutes</b>.", body))
    S.append(Spacer(1, 7))

    S.append(Paragraph("What the new model does", h2))
    rows = [[Paragraph(f"<b>{h}</b>", cell) for h in
             ("", "Old model", "New model")]]
    spec = [
        ("Drain rate", "2 %/min while patrolling only",
         "<b>2 %/min, unchanged</b> &mdash; but now in every flying state: "
         "patrol, ferry out and ferry back"),
        ("Docking stations", "No position. A flat 60 s ferry from anywhere. "
         "The availability model used one dock at the midpoint (14.30 km).",
         "<b>Five stations along the route</b> at (i + &#189;)&middot;L/n &mdash; "
         "2.86, 8.58, 14.30, 20.02, 25.74 km. That spacing minimises the "
         "worst-case distance to a dock: <b>2.86 km</b>, 358 s of flight, "
         "11.9 % of a pack."),
        ("Choosing a dock", "None to choose.",
         "The drone computes the distance to its <b>nearest</b> station, flies "
         "there draining normally, and rejoins its segment at the end closest "
         "to that dock, draining on the way back too."),
        ("Return trigger", "Fixed 25 %.",
         "Whichever is <b>higher</b>: 25 %, or the charge needed to reach the "
         "nearest dock plus a 5 % margin. A drone far from a dock leaves "
         "earlier; none is ever scheduled to arrive empty."),
        ("At the station", "Charged 0&rarr;100 % in 240 s (~25 %/min, beyond "
         "any real fast-charger), released on 80 % <i>and</i> 240 s.",
         "<b>The pack is swapped.</b> The drone lands, a charged pack is "
         "fitted, it leaves at 100 %. A fixed <b>120 s</b> handling time that "
         "does not depend on state of charge &mdash; which is what makes the "
         "dwell physically meaningful."),
    ]
    for name, o, n in spec:
        rows.append([Paragraph(f"<b>{name}</b>", cell), Paragraph(o, cell),
                     Paragraph(n, cell)])
    t = Table(rows, colWidths=[24*mm, 58*mm, 90*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#b8b8b8")),
        ("BACKGROUND", (1, 1), (1, -1), colors.HexColor("#fdf0f0")),
        ("BACKGROUND", (2, 1), (2, -1), colors.HexColor("#f0f5fa")),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    S.append(t)
    S.append(Spacer(1, 7))

    img = Image(str(FIG), width=172*mm, height=172*mm * (3.5 / 10.6))
    S.append(KeepTogether([img, Spacer(1, 1), Paragraph(
        "<b>Left:</b> share of the day a patrol segment has no drone over it, "
        "at reserve ratio &rho; = 0.2, uniform segmentation (log scale). "
        "<b>Right:</b> the old model took a flat 300 s whatever the geometry; "
        "the new one averages 210 s and varies with distance (130&ndash;475 s).",
        cap)]))
    S.append(Spacer(1, 7))

    S.append(Paragraph("What changed in the results", h2))
    box = Table([[Paragraph(
        "<b>Coverage gaps collapse.</b> The share of the day a segment sits "
        "uncovered falls from <b>35&ndash;43 % to 0.3&ndash;1.5 %</b> across "
        "M = 3, 5, 10 and 16. This is the one large change, and it is a "
        "correction rather than an improvement: the old figure was measuring a "
        "95-minute recharge that no charger can deliver, not a property of the "
        "fleet.<br/>"
        "<b>Detection performance barely moves.</b> At M = 10, mean alert time "
        "goes from <b>170.2 s to 173.8 s</b> (+2 %) and the missed share is "
        "unchanged at 0.13 %. Drones are off their segment for less time "
        "(300 s &rarr; 210 s), so availability rises from <b>94.3 % to "
        "96.7 %</b>. The headline detection results in the manuscript are "
        "therefore not disturbed.<br/>"
        "<b>No drone is ever stranded.</b> Across a 12 h trace of 175 dock "
        "cycles the battery floor is <b>13.2 %</b>, comfortably above the 5 % "
        "margin, because the return trigger now accounts for the distance "
        "actually to be flown.<br/>"
        "<b>One model, two views.</b> The fleet-availability page and the "
        "detection simulator now import the same drain rate, dock positions, "
        "swap time and safety margin from one place, so they cannot drift "
        "apart. What differs between them is the question each asks, not the "
        "physics.<br/>"
        "<b>Still to do.</b> The manuscript's Operational Layer section, its "
        "parameter table and its battery sensitivity figure all describe the "
        "old model and must be rewritten before submission.", body)]],
        colWidths=[172*mm])
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, NAVY),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fafbfd")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    S.append(box)

    def footer(canv, doc):
        canv.saveState()
        canv.setFont("Helvetica", 6.3)
        canv.setFillColor(GREY)
        canv.drawString(19*mm, 9*mm,
                        "simulateOnce(): 20 seeds x 30-day trials, uniform "
                        "patrol.  simulateBatteryDocking(rho=0.2).  Branch "
                        "feat/dock-stations-battery-swap.")
        canv.drawRightString(A4[0] - 19*mm, 9*mm, "Operational layer")
        canv.restoreState()

    doc = BaseDocTemplate(str(OUT_PDF), pagesize=A4,
                          title="Revised UAV Battery and Docking Model",
                          author="Hussein Nasereddine",
                          leftMargin=19*mm, rightMargin=19*mm,
                          topMargin=13*mm, bottomMargin=13*mm)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
                  id="main", showBoundary=0)
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=footer)])
    doc.build(S)
    print(f"wrote {OUT_PDF.relative_to(ROOT)}")
    print(f"wrote {OUT_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
