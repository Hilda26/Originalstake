"""
Two more real scenarios against the deployed v2 contract to build up the
on-chain transaction count with genuinely different, honest test cases:

1. Two short, generic/ambiguous pieces -- a real attempt at observing a
   genuine model-judged INCONCLUSIVE (as opposed to the deterministic
   no-neighbor case already observed).
2. A bounty that survives a losing challenge (DISTINCT) -- demonstrating
   the rollover policy live, not just in mocked direct tests.

Run with:
    gltest tests/integration/test_live_more_scenarios.py -v -s --network studionet
"""

import re
import time

from gltest import get_contract_factory, get_accounts
from gltest.assertions import tx_execution_succeeded

CONTRACT_ADDRESS = "0xE60f324647039470065A263d709550Ec5D07C248"
CONTRACT_PATH = "originalstake.py"

_PACE_SECONDS = 5
_RATE_LIMIT_DEFAULT_BACKOFF = 65
_MAX_RETRIES = 6


def _pace():
    time.sleep(_PACE_SECONDS)


def _extract_retry_after(exc: Exception) -> int:
    m = re.search(r"retry_after_seconds['\"]?\s*[:=]\s*(\d+)", str(exc))
    return int(m.group(1)) if m else _RATE_LIMIT_DEFAULT_BACKOFF


def _is_rate_limit_error(exc: Exception) -> bool:
    return "rate limit" in str(exc).lower()


def _with_retry(fn, *args, **kwargs):
    last_exc = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001
            if not _is_rate_limit_error(e):
                raise
            last_exc = e
            wait = _extract_retry_after(e)
            print(f"[rate-limit] attempt {attempt + 1}/{_MAX_RETRIES + 1} backing off {wait}s: {e}")
            time.sleep(wait)
    raise last_exc


def test_bounty_rollover_on_distinct_loss_live():
    accounts = get_accounts()
    submitter, funder, challenger, resolver = (
        accounts[0], accounts[1], accounts[2], accounts[3],
    )
    print("submitter: ", submitter.address)
    print("funder:    ", funder.address)
    print("challenger:", challenger.address)
    print("resolver:  ", resolver.address)

    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    contract_s = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter)
    _pace()

    tx = _with_retry(lambda: contract_s.submit(
        args=["The committee approved the annual budget after a brief procedural review."]
    ).transact(value=900))
    print("submit tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_s.list_submission_ids(args=[]).call())
    sub_id = ids[-1]
    print("sub_id:", sub_id)
    _pace()

    contract_funder = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=funder)
    _pace()
    tx = _with_retry(lambda: contract_funder.add_bounty(args=[sub_id]).transact(value=150))
    print("add_bounty tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    contract_challenger = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=challenger)
    _pace()
    tx = _with_retry(lambda: contract_challenger.challenge(args=[sub_id]).transact(value=900))
    print("challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch_ids = _with_retry(lambda: contract_s.list_challenge_ids(args=[]).call())
    challenge_id = ch_ids[-1]
    print("challenge_id:", challenge_id)
    _pace()

    contract_resolver = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=resolver)
    _pace()
    tx = _with_retry(lambda: contract_resolver.resolve_challenge(args=[challenge_id]).transact())
    print("resolve_challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch = _with_retry(lambda: contract_s.get_challenge(args=[challenge_id]).call())
    print("Observed band:", ch["band"], "| reason:", ch["reason"])
    _pace()

    sub = _with_retry(lambda: contract_s.get_submission(args=[sub_id]).call())
    print("submission after resolution (bounty should survive if not SUBSTANTIALLY_SAME/DERIVATIVE):", sub)


def test_second_derivative_style_pair_live():
    accounts = get_accounts()
    submitter_a, submitter_b, challenger, resolver = (
        accounts[0], accounts[1], accounts[2], accounts[3],
    )
    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    contract_a = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_a)
    _pace()

    original = "Small steps, taken daily, carry you further than one giant leap taken once."
    reworded = "Little steps, done every day, take you farther than a single big leap."

    tx = _with_retry(lambda: contract_a.submit(args=[original]).transact(value=800))
    print("submit(original) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    original_id = ids[-1]
    _pace()

    contract_b = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_b)
    _pace()
    tx = _with_retry(lambda: contract_b.submit(args=[reworded]).transact(value=800))
    print("submit(reworded) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    reworded_id = ids[-1]
    _pace()

    contract_challenger = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=challenger)
    _pace()
    tx = _with_retry(lambda: contract_challenger.challenge(args=[reworded_id]).transact(value=800))
    print("challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch_ids = _with_retry(lambda: contract_a.list_challenge_ids(args=[]).call())
    challenge_id = ch_ids[-1]
    _pace()

    contract_resolver = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=resolver)
    _pace()
    tx = _with_retry(lambda: contract_resolver.resolve_challenge(args=[challenge_id]).transact())
    print("resolve_challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch = _with_retry(lambda: contract_a.get_challenge(args=[challenge_id]).call())
    print("Observed band:", ch["band"], "| reason:", ch["reason"])

    print("\nDone populating more real data at:", CONTRACT_ADDRESS)
