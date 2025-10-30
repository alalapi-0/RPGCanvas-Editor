"""Configuration helpers for OnePass Audio text processing tools."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class NormalizeOriginalConfig:
    """Configuration values used by :mod:`normalize_original`.

    Attributes
    ----------
    source_dir:
        Directory that contains the raw transcript files waiting to be
        normalised.
    output_dir:
        Directory that receives the normalised versions of the transcripts.
    report_path:
        JSON file that stores the dry-run/real-run report output.
    encoding:
        Text encoding used for input/output files.
    """

    source_dir: Path = PROJECT_ROOT / "data" / "original_txt"
    output_dir: Path = PROJECT_ROOT / "results" / "normalized_original"
    report_path: Path = PROJECT_ROOT / "results" / "normalized_original" / "report.json"
    encoding: str = "utf-8"

    def ensure_directories(self) -> None:
        """Ensure output directories exist.

        The input directory is intentionally left untouched so that we do not
        accidentally create it in an unexpected location when the user has a
        typo in the configuration.
        """

        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.report_path.parent.mkdir(parents=True, exist_ok=True)


DEFAULT_CONFIG = NormalizeOriginalConfig()

__all__ = [
    "DEFAULT_CONFIG",
    "NormalizeOriginalConfig",
    "PROJECT_ROOT",
]
