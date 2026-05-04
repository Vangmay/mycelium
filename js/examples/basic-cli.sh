#!/bin/bash
# Mycelium — basic local tools usage
# Requires TINYFISH_API_KEY when using the default TinyFish adapter.
# OPENAI_API_KEY is optional; deterministic rule extraction works without it.

# First run — no knowledge, starts fresh
npx myc run amazon.com "find the price of Kindle Paperwhite"

# Second run — loads hints from first run, already smarter
npx myc run amazon.com "find the price of Kindle Paperwhite"

# See what was learned
npx myc inspect amazon.com

# Check progress across all domains
npx myc stats

# Remove knowledge for a domain (useful for testing)
# npx myc clear amazon.com
