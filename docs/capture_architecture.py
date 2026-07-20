"""Render docs/architecture.html to docs/architecture.png at 2x for crisp README display.

Run:  uv run --with playwright python capture_architecture.py
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 2000, "height": 1250}, device_scale_factor=2)
    page.goto(f"file://{HERE / 'architecture.html'}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(HERE / "architecture.png"))
    browser.close()

print("wrote", HERE / "architecture.png")
