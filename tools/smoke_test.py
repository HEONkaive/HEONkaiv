#!/usr/bin/env python3
"""Run v6 UI regressions (requires Python Playwright and Chromium)."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('v6_regression.py')), run_name='__main__')
