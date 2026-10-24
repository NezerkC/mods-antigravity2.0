"""Entrypoint for the Scientific Calculator application."""
import sys
from pathlib import Path

# Ensure the root of the calculator app is on sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.ui.app import ScientificCalculatorApp

def main():
    app = ScientificCalculatorApp()
    app.mainloop()

if __name__ == "__main__":
    main()
