# Mycelium — advanced SDK usage with manual prime/record
# python python/examples/advanced_sdk.py

from dotenv import load_dotenv
load_dotenv()

from mycelium import prime, record, build_goal, RunOutcome


def call_my_agent(domain: str, goal: str) -> dict:
    # Replace with your own TinyFish integration
    return {
        "ok": True,
        "steps": ["navigated", "clicked", "extracted"],
        "errors": [],
        "raw_text": f"Successfully extracted data from {domain}",
        "data": {"result": "example"},
    }


def my_pipeline(domain: str, goal: str):
    primed = prime(domain, goal)
    print(f"loaded {primed.hints_loaded} hints for {domain}")

    enriched_goal = build_goal(goal, primed)

    agent_result = call_my_agent(domain, enriched_goal)

    recorded = record(RunOutcome(
        domain=domain,
        goal=goal,
        success=agent_result["ok"],
        steps=agent_result["steps"],
        errors=agent_result["errors"],
        raw=agent_result["raw_text"],
    ))

    print(f"saved {recorded.hints_extracted} new hints ({recorded.hints_total} total)")
    return agent_result


my_pipeline("amazon.com", "find the price of AirPods Pro")
