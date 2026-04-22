# Mycelium — batch SDK usage across multiple domains
# python python/examples/batch_tasks.py

from dotenv import load_dotenv
load_dotenv()

import json
from pathlib import Path
from mycelium import run

TASKS_FILE = Path(__file__).parent.parent.parent / "js" / "examples" / "batch-tasks.json"

tasks = json.loads(TASKS_FILE.read_text())

for task in tasks:
    label = task.get("label", task["url"])
    print(f"\n── {label}")
    result = run(task["url"], task["goal"])
    status = "✓" if result.success else "✗"
    print(f"  {status}  hints loaded: {result.primed.hints_loaded}  hints saved: {result.recorded.hints_extracted}")
    if result.data:
        print(f"  data: {result.data}")
