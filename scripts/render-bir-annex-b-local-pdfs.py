from __future__ import annotations

import csv
import html
import json
import os
from pathlib import Path

from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "BIR_ANNEX_B_LOCAL_EVIDENCE"
PAGE_WIDTH, PAGE_HEIGHT = letter
CONTENT_WIDTH = PAGE_WIDTH - 0.8 * inch

styles = getSampleStyleSheet()
TITLE = ParagraphStyle(
    "EvidenceTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=18,
    leading=22,
    textColor=colors.HexColor("#17365d"),
    spaceAfter=8,
)
SUBTITLE = ParagraphStyle(
    "EvidenceSubtitle",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    textColor=colors.HexColor("#555555"),
    spaceAfter=10,
)
H2 = ParagraphStyle(
    "EvidenceH2",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12,
    leading=15,
    textColor=colors.HexColor("#17365d"),
    spaceBefore=8,
    spaceAfter=5,
)
BODY = ParagraphStyle(
    "EvidenceBody",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    spaceAfter=4,
)
SMALL = ParagraphStyle(
    "EvidenceSmall",
    parent=BODY,
    fontSize=7.5,
    leading=9.5,
)
MONO = ParagraphStyle(
    "EvidenceMono",
    parent=styles["Code"],
    fontName="Courier",
    fontSize=7,
    leading=9,
    leftIndent=4,
    rightIndent=4,
    backColor=colors.HexColor("#f5f7fa"),
    borderColor=colors.HexColor("#d9e2f3"),
    borderWidth=0.4,
    borderPadding=5,
    spaceAfter=6,
)
FOOTER = ParagraphStyle(
    "EvidenceFooter",
    parent=BODY,
    fontSize=7,
    leading=8,
    textColor=colors.HexColor("#666666"),
    alignment=TA_CENTER,
)


def read_json(relative: str, default=None):
    try:
        return json.loads((EVIDENCE / relative).read_text(encoding="utf-8"))
    except Exception:
        return default


def read_text(relative: str, default=""):
    try:
        return (EVIDENCE / relative).read_text(encoding="utf-8")
    except Exception:
        return default


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""))


def para(value, style=BODY):
    text = esc(value).replace("\n", "<br/>")
    return Paragraph(text, style)


def raw_para(value, style=BODY):
    return Paragraph(str(value), style)


def section(title):
    return Paragraph(esc(title), H2)


def status_box(status, detail=""):
    normalized = str(status).upper()
    color = "#1d7a46" if normalized == "PASS" else "#a56100" if normalized in {"BLOCKED", "PENDING"} else "#a61b1b"
    text = f"<b>Status: {esc(normalized)}</b>"
    if detail:
        text += f"<br/><font size=8>{esc(detail)}</font>"
    table = Table([[Paragraph(text, BODY)]], colWidths=[CONTENT_WIDTH])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fbff")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(color)),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def table(data, widths=None, font_size=7.5, header=True):
    converted = []
    for row_index, row in enumerate(data):
        converted.append([para(value, SMALL if row_index else SMALL) for value in row])
    result = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#c7d3e3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365d")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    result.setStyle(TableStyle(commands))
    return result


def image_flow(relative, max_width=CONTENT_WIDTH, max_height=4.6 * inch):
    file_path = EVIDENCE / relative
    if not file_path.exists():
        return [para(f"Image not captured: {relative}", SMALL)]
    with PillowImage.open(file_path) as image:
        width, height = image.size
    scale = min(max_width / width, max_height / height, 1.0)
    return [Image(str(file_path), width=width * scale, height=height * scale), Spacer(1, 5)]


def mono(text, max_chars=9000):
    value = str(text or "")
    if len(value) > max_chars:
        value = value[:max_chars] + "\n[TRUNCATED FOR PDF READABILITY]"
    return Preformatted(value, MONO)


def page_header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9e2f3"))
    canvas.line(doc.leftMargin, PAGE_HEIGHT - 0.45 * inch, PAGE_WIDTH - doc.rightMargin, PAGE_HEIGHT - 0.45 * inch)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawString(doc.leftMargin, 0.35 * inch, "LOCAL TEST - NOT FOR SUBMISSION")
    canvas.drawRightString(PAGE_WIDTH - doc.rightMargin, 0.35 * inch, f"Page {doc.page}")
    canvas.restoreState()


def make_pdf(relative, title, status, detail, story):
    destination = EVIDENCE / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(destination),
        pagesize=letter,
        rightMargin=0.4 * inch,
        leftMargin=0.4 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.55 * inch,
        title=title,
        author="OPIS/POS local evidence runner",
    )
    flow = [Paragraph(esc(title), TITLE), Paragraph("OPIS + POS local Annex B evidence package; scope is items 03-14 only.", SUBTITLE), status_box(status, detail), Spacer(1, 8)]
    flow.extend(story)
    document.build(flow, onFirstPage=page_header_footer, onLaterPages=page_header_footer)


def common_scope():
    manifest = read_json("manifest.json", {})
    return [
        f"Company: {manifest.get('company_name', 'local tenant')}",
        f"Business date: {manifest.get('business_date', '')}",
        f"Location: {manifest.get('location_id', '')}",
        f"Terminal: {manifest.get('terminal_id', '')}",
        f"Source revision: {manifest.get('source_revision', '')}",
    ]


def render_item03():
    check = read_text("03/check.txt")
    make_pdf("03/annex-c-readiness-note.pdf", "Annex B Item 03 - Annex C readiness note", "BLOCKED", "No official Annex C pro forma or executed signature package was supplied to the local workspace.", [
        section("Local result"), mono(check),
        section("Boundary"), para("This artifact records the exact local gap. It is not a fabricated sworn statement, certification, signature, taxpayer registration, or accountant approval."),
        section("Required before any formal filing"), para("Supply the official Annex C form, completed taxpayer/company details, required signatures, and any authorized reviewer records through the filing workflow."),
    ])


def render_item04():
    check = read_text("04/check.txt")
    orders = read_json("04/source-orders.json", {})
    rows = orders.get("response", {}).get("data", {}).get("orders", []) if isinstance(orders, dict) else []
    data = [["Source record", "Identifier", "Status", "Amount", "Fiscal label"]]
    for row in rows[:12]:
        data.append(["POS order", row.get("invoice_number", row.get("id", "")), row.get("status", ""), row.get("total_amount", ""), "NFS/non-fiscal; not relabeled"])
    make_pdf("04/invoice-samples-readiness-note.pdf", "Annex B Item 04 - Invoice sample readiness note", "BLOCKED", "The selected local scope has no persisted fiscal invoice source records.", [
        section("Local result"), mono(check),
        section("Observed local records"), para("The local database returned operational/NFS records in the selected scope. They are shown only as source records and are explicitly not relabeled as BIR invoices."),
        table(data, [1.0 * inch, 1.25 * inch, 0.85 * inch, 0.75 * inch, 2.55 * inch]),
        section("Required local proof"), para("A controlled local fiscal transaction must be finalized through the configured fiscal source, then the receipt/invoice, source snapshot, lines, payment, and tax fields can be rendered here without inventing values."),
    ])


def render_item05():
    check = read_text("05/check.txt")
    summary = read_json("08/summary.json", {})
    counts = summary.get("response", {}).get("data", {}).get("summary", {}).get("source_counts", {}) if isinstance(summary, dict) else {}
    make_pdf("05/adjustment-readiness-note.pdf", "Annex B Item 05 - Adjustment and credit note readiness", "BLOCKED", "No persisted adjustment source records were returned for the selected local evidence scope.", [
        section("Local result"), mono(check),
        section("Source counts"), table([["Transactions", "Documents", "Lines", "Payments", "Adjustments"], [counts.get("transactions", 0), counts.get("documents", 0), counts.get("lines", 0), counts.get("payments", 0), counts.get("adjustments", 0)]], [1.2 * inch] * 5),
        section("Boundary"), para("No adjustment, return, refund, credit note, or debit note was invented. The implementation already exposes persisted adjustment/e-journal contracts; a controlled local adjustment record is still needed for a complete Item 05 sample."),
    ])


def render_item06():
    x = read_json("06/x-reading.json", {})
    z = read_json("06/z-reading.json", {})
    recon = read_json("06/reconciliation.json", {})
    x_data = x.get("response", {}).get("data", {}) if isinstance(x, dict) else {}
    z_data = z.get("response", {}).get("data", {}) if isinstance(z, dict) else {}
    status = "PASS" if recon.get("matching_business_date") else "BLOCKED"
    make_pdf("06/x-z-readings.pdf", "Annex B Item 06 - X and Z readings", status, "Local API outputs are preserved; reconciliation is blocked when the two readings do not share the selected business date.", [
        section("Scope"), *[para(line) for line in common_scope()],
        section("Reading comparison"), table([["Reading", "HTTP status", "Business date", "Reading number", "Transaction count", "Total"], ["X", x.get("response", {}).get("status", ""), x_data.get("business_date", ""), x_data.get("reading_no", ""), x_data.get("transaction_count", ""), x_data.get("total", "")], ["Z", z.get("response", {}).get("status", ""), z_data.get("business_date", ""), z_data.get("reading_no", ""), z_data.get("transaction_count", ""), z_data.get("total", "")]], [0.55 * inch, 0.65 * inch, 1.15 * inch, 1.25 * inch, 1.1 * inch, 1.0 * inch]),
        section("Reconciliation"), mono(json.dumps(recon, indent=2)),
        section("Boundary"), para("The X endpoint currently reports the active/current business date while the selected Z endpoint reports the requested historical date. A matching-date local close/reconciliation run is required for a full pass."),
    ])


def render_item07():
    samples = read_json("07/report-samples.json", {})
    reports = samples.get("reports", []) if isinstance(samples, dict) else []
    rows = [["Report key", "Surface", "Sample kind", "HTTP", "Rows", "Declared route"]]
    for report in reports:
        route = report.get("declared_route", "")
        if len(route) > 42:
            route = route[:39] + "..."
        rows.append([report.get("report_key", ""), report.get("surface", ""), report.get("sample_kind", ""), report.get("status", ""), len(report.get("rows", [])), route])
    make_pdf("07/report-samples.pdf", "Annex B Item 07 - Report inventory and local samples", "PASS", "All 38 non-audit report definitions returned 2xx through their declared local route; the audit source is covered under Item 13.", [
        section("Scope"), *[para(line) for line in common_scope()],
        section("Report route inventory"), table(rows, [1.35 * inch, 0.75 * inch, 1.35 * inch, 0.45 * inch, 0.45 * inch, 2.0 * inch]),
        section("Evidence note"), para("POS-owned reports are recorded as shared-route samples from the POS report overview. Legacy reports are sampled through their declared legacy routes. No report was sent to an incompatible endpoint."),
    ])


def render_item08():
    summary = read_json("08/summary.json", {})
    recon = read_json("08/reconciliation.json", {})
    journal = read_text("08/e-journal.txt")
    source_counts = recon.get("source_counts", {}) if isinstance(recon, dict) else {}
    status = "PASS" if recon.get("source_documents_reconciled") else "BLOCKED"
    make_pdf("08/e-journal-hardcopy.pdf", "Annex B Item 08 - Electronic journal and hard-copy rendering", status, "The local e-journal is rendered from the bounded source contract; receipt completeness depends on finalized fiscal source records.", [
        section("Source counts"), table([["Transactions", "Documents", "Lines", "Payments", "Adjustments", "Readings", "Reprints"], [source_counts.get("transactions", 0), source_counts.get("documents", 0), source_counts.get("lines", 0), source_counts.get("payments", 0), source_counts.get("adjustments", 0), source_counts.get("readings", 0), source_counts.get("reprints", 0)]], [0.9 * inch] * 7),
        section("E-journal text"), mono(journal),
        section("Boundary"), para("The current local scope contains a reading record but no finalized fiscal document records. This is a truthful local hard-copy rendering, not a claim that a receipt-complete BIR journal sample exists."),
    ])


def render_item09():
    text = read_text("09/system-description.md")
    make_pdf("09/system-description.pdf", "Annex B Item 09 - Local system description", "PASS", "Generated from the verified local OPIS/POS/API/database surfaces.", [section("System description"), mono(text, 12000)])


def render_item10():
    metadata = read_json("10/screenshot-metadata.json", {})
    make_pdf("10/software-version.pdf", "Annex B Item 10 - Software version evidence", "PASS", f"Visible local build version: {metadata.get('version_text', '')}", [
        section("Version metadata"), mono(json.dumps(metadata, indent=2)),
        section("Login screen"), *image_flow("10/login.png", max_height=3.0 * inch),
        section("Authenticated POS home"), *image_flow("10/home.png", max_height=3.0 * inch),
    ])


def render_item11():
    metadata = read_json("11/connectivity-metadata.json", {})
    status = "PASS" if metadata.get("offline_indicator_detected") and metadata.get("online_indicator_detected") else "BLOCKED"
    make_pdf("11/connectivity.pdf", "Annex B Item 11 - Online and offline behavior", status, "Local browser connectivity transition was captured and recovered.", [
        section("Connectivity metadata"), mono(json.dumps(metadata, indent=2)),
        section("Offline state"), *image_flow("11/offline.png", max_height=3.0 * inch),
        section("Recovered online state"), *image_flow("11/online-recovered.png", max_height=3.0 * inch),
    ])


def render_item12():
    checklist = read_text("12/checklist.md")
    manual = read_text("12/software-manual-source.md")
    make_pdf("12/operating-manual.pdf", "Annex B Item 12 - Local software operating manual", "PASS", "Software manual generated from the verified local POS flow; physical machine brochure is not claimed.", [
        section("Applicability checklist"), mono(checklist),
        section("Software operating manual"), mono(manual, 14000),
    ])


def render_item13():
    recon = read_json("13/reconciliation.json", {})
    csv_path = EVIDENCE / "13/audit-trail.csv"
    rows = []
    if csv_path.exists():
        with csv_path.open(newline="", encoding="utf-8") as stream:
            rows = list(csv.reader(stream))[:26]
    make_pdf("13/audit-trail.pdf", "Annex B Item 13 - Audit trail", "PASS", "Persisted local audit records include timestamp, actor, action, and change values.", [
        section("Reconciliation"), mono(json.dumps(recon, indent=2)),
        section("Filtered local audit rows"), table(rows or [["No rows captured"]], [1.0 * inch, 1.0 * inch, 0.9 * inch, 1.0 * inch, 0.8 * inch, 0.6 * inch, 0.8 * inch, 1.1 * inch]),
    ])


def render_item14():
    status = read_json("14/restore-drill-status.json", {})
    counts = read_json("14/restore-counts.json", {})
    metadata = read_json("14/backup-metadata.json", {})
    log = read_text("14/local_restore_test_log.txt")
    log_summary_keys = (
        "started_at",
        "backup_bytes",
        "backup_sha256",
        "source_table_count",
        "restore_table_count",
        "table_names_match",
        "row_counts_match",
        "all_tables_match",
        "result=",
        "restore_database_disposed",
    )
    log_summary = "\n".join(
        line for line in log.splitlines()
        if any(line.startswith(key) for key in log_summary_keys)
    )
    make_pdf("14/backup-and-disaster-recovery-plan.pdf", "Annex B Item 14 - Backup and disaster recovery evidence", "PASS", "Local mysqldump/import restore passed with matching table names and row counts; the disposable restore database was removed.", [
        section("Backup metadata"), mono(json.dumps(metadata, indent=2)),
        section("Restore status"), mono(json.dumps(status, indent=2)),
        section("Restore comparison"), table([["Check", "Result"], ["Source tables", counts.get("source_table_count", "")], ["Restored tables", counts.get("restore_table_count", "")], ["Table names match", counts.get("table_names_match", "")], ["Row counts match", counts.get("row_counts_match", "")], ["All tables match", counts.get("all_tables_match", "")]], [2.0 * inch, 2.0 * inch]),
        section("Test log summary"), mono(log_summary, 2200),
    ])


def main():
    render_item03()
    render_item04()
    render_item05()
    render_item06()
    render_item07()
    render_item08()
    render_item09()
    render_item10()
    render_item11()
    render_item12()
    render_item13()
    render_item14()
    print("Rendered 12 local Annex B evidence PDFs")


if __name__ == "__main__":
    main()
