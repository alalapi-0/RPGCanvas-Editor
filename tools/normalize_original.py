"""Normalize original transcript text files.

This utility applies Unicode NFKC normalisation and performs a small amount
of compatibility clean-up so that the text files are easier to consume by the
OnePass Audio pipeline.  The original implementation required interactive
confirmation before doing anything which made automation difficult.  The new
version keeps an optional interactive mode behind ``--interactive`` while the
non-interactive default mirrors the user's expectation of “just run”.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, List
import unicodedata

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from tools.config import DEFAULT_CONFIG, NormalizeOriginalConfig  # type: ignore
else:
    from .config import DEFAULT_CONFIG, NormalizeOriginalConfig


HEADER = """========================
OnePass Audio — 录完即净，一遍过
========================
版本: 0.0.0
原文文本规范化工具。
"""

STEP_TITLE = """=======================
预处理：原文规范化（NFKC + 兼容字清洗）
=======================
"""


@dataclass
class FileReport:
    """A summary of changes applied to a single file."""

    path: str
    changed: bool
    characters_before: int
    characters_after: int


@dataclass
class RunReport:
    """Collection of per-file results along with meta information."""

    source_dir: str
    output_dir: str
    dry_run: bool
    files: List[FileReport]


COMPATIBILITY_TRANSLATION = str.maketrans({
    "\u3000": " ",  # full-width space
    "\u2014": "-",  # em dash
    "\u2013": "-",  # en dash
    "\u00A0": " ",  # non-breaking space
    "\uFF5E": "~",  # full-width tilde
    "\uFF0D": "-",  # full-width hyphen-minus
    "\u2018": "'",
    "\u2019": "'",
    "\u201C": '"',
    "\u201D": '"',
})


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize original transcripts")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only analyse the files and write the report without producing normalised outputs.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Re-enable interactive confirmation prompts (disabled by default).",
    )
    parser.add_argument(
        "--source",
        type=Path,
        help="Override the default source directory containing raw transcripts.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Override the default output directory for normalised transcripts.",
    )
    return parser.parse_args(list(argv))


def normalise_text(content: str) -> str:
    """Return the NFKC-normalised and compatibility-cleaned version of ``content``."""

    normalized = unicodedata.normalize("NFKC", content)
    translated = normalized.translate(COMPATIBILITY_TRANSLATION)
    cleaned = "".join(ch for ch in translated if not _is_variation_selector(ch))
    return cleaned


def _is_variation_selector(ch: str) -> bool:
    return "VARIATION SELECTOR" in unicodedata.name(ch, "")


def gather_files(source_dir: Path) -> List[Path]:
    return sorted(p for p in source_dir.rglob("*.txt") if p.is_file())


def process_files(files: Iterable[Path], cfg: NormalizeOriginalConfig, dry_run: bool) -> RunReport:
    reports: List[FileReport] = []

    for path in files:
        original = path.read_text(encoding=cfg.encoding)
        normalized = normalise_text(original)
        changed = normalized != original
        reports.append(
            FileReport(
                path=str(path.relative_to(cfg.source_dir)),
                changed=changed,
                characters_before=len(original),
                characters_after=len(normalized),
            )
        )
        if not dry_run:
            output_path = cfg.output_dir / path.relative_to(cfg.source_dir)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(normalized, encoding=cfg.encoding)

    return RunReport(
        source_dir=str(cfg.source_dir),
        output_dir=str(cfg.output_dir),
        dry_run=dry_run,
        files=reports,
    )


def write_report(report: RunReport, cfg: NormalizeOriginalConfig) -> None:
    payload = {
        "source_dir": report.source_dir,
        "output_dir": report.output_dir,
        "dry_run": report.dry_run,
        "files": [asdict(item) for item in report.files],
    }
    cfg.report_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding=cfg.encoding,
    )


def prompt_yes_no(prompt: str, default: bool) -> bool:
    answer = input(f"{prompt} [{'Y' if default else 'y'}/{'n' if default else 'N'}]: ")
    normalized = answer.strip().lower()
    if not normalized:
        return default
    return normalized in {"y", "yes"}


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)

    cfg = DEFAULT_CONFIG
    if args.source:
        cfg = NormalizeOriginalConfig(
            source_dir=args.source,
            output_dir=args.output or DEFAULT_CONFIG.output_dir,
            report_path=args.output.joinpath("report.json") if args.output else DEFAULT_CONFIG.report_path,
            encoding=DEFAULT_CONFIG.encoding,
        )
    elif args.output:
        cfg = NormalizeOriginalConfig(
            source_dir=DEFAULT_CONFIG.source_dir,
            output_dir=args.output,
            report_path=args.output.joinpath("report.json"),
            encoding=DEFAULT_CONFIG.encoding,
        )

    cfg.ensure_directories()

    print(HEADER)
    print(STEP_TITLE)
    print("10) 预处理：原文规范化（NFKC + 兼容字清洗）")

    dry_run = args.dry_run
    if args.interactive:
        run_now = prompt_yes_no("是否现在执行原文规范化?", default=True)
        if not run_now:
            print("已取消原文规范化。")
            return 0
        dry_run = prompt_yes_no("是否先 dry-run，仅生成报告?", default=dry_run)
    else:
        print("[info] 已启用非交互模式，直接执行原文规范化。")

    if not cfg.source_dir.exists() or not cfg.source_dir.is_dir():
        print(f"[error] 源目录不存在或不是文件夹: {cfg.source_dir}")
        print("[hint] 请确认已准备好原始文本。首次运行可手动创建该目录并放入 .txt 文件。")
        return 1

    files = gather_files(cfg.source_dir)
    if not files:
        print(f"[warn] 在 {cfg.source_dir} 中没有找到待处理的 .txt 文件。")
        return 0

    report = process_files(files, cfg, dry_run)
    write_report(report, cfg)

    if dry_run:
        print(f"[done] Dry-run 完成，报告已生成：{cfg.report_path}")
    else:
        print(f"[done] 正式执行完成，结果已写入：{cfg.output_dir}")
        print(f"[info] 处理报告已生成：{cfg.report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
