# Mycelium — basic SDK usage
# pip install -e ./python
# Copy .env.example to .env and fill in your keys, then:
# python python/examples/basic_sdk.py

from dotenv import load_dotenv
load_dotenv()

from mycelium import run

result = run("amazon.com", "find the price of Kindle Paperwhite 16GB")

print("data:", result.data)
print("hints loaded this run:", result.primed.hints_loaded)
print("hints saved this run:", result.recorded.hints_extracted)
print("total hints stored:", result.recorded.hints_total)
