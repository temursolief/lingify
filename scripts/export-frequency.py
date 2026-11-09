"""Export the top English words by frequency (wordfreq) to data/word-frequency.json.

Run once: python3 -m pip install wordfreq && python3 scripts/export-frequency.py
"""
import json
import re
from pathlib import Path

from wordfreq import top_n_list

words = [w for w in top_n_list("en", 40000) if re.fullmatch(r"[a-z]+(?:'[a-z]+)?", w)]
out = Path(__file__).resolve().parent.parent / "data" / "word-frequency.json"
out.write_text(json.dumps(words))
print(f"wrote {len(words)} words to {out}")
