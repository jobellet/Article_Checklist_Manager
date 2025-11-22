from __future__ import annotations

"""Streamlit GUI for uploading manuscripts and running automated checks."""

import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
import tempfile
from typing import Iterable, List, Sequence

import streamlit as st
from PIL import Image, UnidentifiedImageError

from .analysis import SectionSummary, parse_docx_sections

SUPPORTED_MANUSCRIPTS: Sequence[str] = ("docx",)
SUPPORTED_FIGURES: Sequence[str] = ("jpg", "jpeg", "png", "svg", "pdf")
MIN_DPI = 300
MIN_PIXELS = 1500


@dataclass
class FigureReport:
    name: str
    format: str
    resolution_ok: bool
    resolution_note: str
    font_ok: bool
    font_note: str


def _save_upload(upload) -> Path:
    temp_dir = Path(tempfile.mkdtemp(prefix="acm_gui_"))
    file_path = temp_dir / upload.name
    file_path.write_bytes(upload.getbuffer())
    return file_path


def _raster_resolution(path: Path) -> tuple[bool, str]:
    try:
        with Image.open(path) as image:
            width, height = image.size
            dpi = image.info.get("dpi")
            if dpi and all(isinstance(d, (int, float)) for d in dpi):
                min_dpi = min(dpi)
                ok = min_dpi >= MIN_DPI
                note = f"{width}x{height}px at {min_dpi} dpi"
                return ok, note
            ok = width >= MIN_PIXELS and height >= MIN_PIXELS
            note = (
                f"{width}x{height}px (dpi metadata missing; expect >= {MIN_PIXELS}px "
                "on the shortest edge)"
            )
            return ok, note
    except UnidentifiedImageError:
        return False, "Unable to read raster image; file may be corrupted or unsupported"


def _svg_fonts(path: Path) -> tuple[bool, str]:
    text = path.read_text(errors="ignore")
    fonts = set(
        re.findall(r"font-family:[\s\'\"]*([^;\"']+)", text, flags=re.IGNORECASE)
        + re.findall(r"font-family=\"([^\"]+)\"", text, flags=re.IGNORECASE)
    )
    if not fonts:
        return True, "No font declarations found; text likely outlined"
    families = ", ".join(sorted(fonts))
    return True, f"Font declarations detected: {families}"


def _pdf_fonts(path: Path) -> tuple[bool, str]:
    return False, (
        "Font inspection for PDF not yet implemented; verify embedding manually"
    )


def analyze_figures(files: Iterable[Path]) -> List[FigureReport]:
    reports: List[FigureReport] = []
    for path in files:
        suffix = path.suffix.lower().lstrip(".")
        resolution_ok = False
        resolution_note = "Format not supported for resolution checks"
        font_ok = True
        font_note = "Fonts not inspected for this format"

        if suffix in {"jpg", "jpeg", "png"}:
            resolution_ok, resolution_note = _raster_resolution(path)
            font_ok = False
            font_note = "Raster formats cannot expose font data"
        elif suffix == "svg":
            resolution_ok = True
            resolution_note = "Vector format; resolution scales without loss"
            font_ok, font_note = _svg_fonts(path)
        elif suffix == "pdf":
            resolution_ok = True
            resolution_note = "Assuming vector content; manual DPI check recommended"
            font_ok, font_note = _pdf_fonts(path)

        reports.append(
            FigureReport(
                name=path.name,
                format=suffix.upper(),
                resolution_ok=resolution_ok,
                resolution_note=resolution_note,
                font_ok=font_ok,
                font_note=font_note,
            )
        )
    return reports


async def run_async_checks(docx_path: Path, figure_paths: List[Path]):
    sections_task = asyncio.create_task(asyncio.to_thread(parse_docx_sections, docx_path))
    figures_task = asyncio.create_task(asyncio.to_thread(analyze_figures, figure_paths))
    sections, figures = await asyncio.gather(sections_task, figures_task)
    return sections, figures


def _render_sections(sections: List[SectionSummary]) -> None:
    st.subheader("Manuscript sections")
    total_words = sum(section.word_count for section in sections)
    cols = st.columns(3)
    cols[0].metric("Sections detected", len(sections))
    cols[1].metric("Total words", total_words)
    if sections:
        top_section = max(sections, key=lambda s: s.word_count)
        cols[2].metric(
            "Largest section", f"{top_section.title} ({top_section.word_count} words)"
        )
    else:
        cols[2].metric("Largest section", "N/A")
        st.info("No sections detected in this manuscript yet.")
        return

    st.table(
        [
            {
                "Section": section.title,
                "Category": section.category,
                "Words": section.word_count,
            }
            for section in sections
        ]
    )


def _render_figures(figures: List[FigureReport]) -> None:
    st.subheader("Figure checks")
    if not figures:
        st.info("No figures uploaded yet. Add JPEG/PNG/SVG/PDF files to validate resolution and fonts.")
        return

    st.table(
        [
            {
                "File": report.name,
                "Format": report.format,
                "Resolution": "✅" if report.resolution_ok else "⚠️",
                "Resolution note": report.resolution_note,
                "Fonts": "✅" if report.font_ok else "⚠️",
                "Font note": report.font_note,
            }
            for report in figures
        ]
    )


def launch() -> None:
    st.set_page_config(page_title="Article Checklist Manager GUI", layout="wide")
    st.title("Article Checklist Manager — GUI preview")
    st.write(
        "Upload your manuscript and optional figures to trigger automated checks. "
        "Word counts per section, figure resolution, and font hints run as soon as files are added."
    )

    manuscript = st.file_uploader(
        "Manuscript (.docx)",
        type=list(SUPPORTED_MANUSCRIPTS),
        accept_multiple_files=False,
        help="Upload a .docx manuscript to extract sections and word counts",
    )
    figures = st.file_uploader(
        "Figures (JPEG, PNG, SVG, PDF)",
        type=list(SUPPORTED_FIGURES),
        accept_multiple_files=True,
        help="Optional: add one or more figure files for resolution and font checks",
    )

    if manuscript is None:
        st.warning("Upload a .docx manuscript to begin analysis.")
        return

    manuscript_path = _save_upload(manuscript)
    figure_paths = [_save_upload(fig) for fig in figures] if figures else []

    with st.spinner("Running automated routines asynchronously..."):
        sections, figure_reports = asyncio.run(run_async_checks(manuscript_path, figure_paths))

    _render_sections(sections)
    _render_figures(figure_reports)


def main() -> None:
    launch()


if __name__ == "__main__":
    main()
