"""
logger_setup.py — AskMiro Lead Intelligence OS
Centralised logging configuration. Called once at startup by each runner.
"""

import logging
import sys
from pathlib import Path

from config import LOG_LEVEL, LOG_FILE


def setup_logging(level: str = None) -> None:
    level_str = (level or LOG_LEVEL).upper()
    level_int = getattr(logging, level_str, logging.INFO)

    fmt = logging.Formatter(
        fmt   = "%(asctime)s │ %(levelname)-8s │ %(name)-30s │ %(message)s",
        datefmt = "%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(level_int)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(level_int)
    ch.setFormatter(fmt)
    root.addHandler(ch)

    # File handler — rotate on each run would need RotatingFileHandler in prod
    fh = logging.FileHandler(str(LOG_FILE), encoding="utf-8")
    fh.setLevel(logging.DEBUG)  # Always log debug to file
    fh.setFormatter(fmt)
    root.addHandler(fh)

    # Quieten noisy libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("anthropic").setLevel(logging.WARNING)
