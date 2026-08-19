"""
An honest attempt at observing a genuine model-judged INCONCLUSIVE live
(as opposed to the already-observed deterministic no-neighbor case) --
two very short, generic pieces of text designed to be genuinely hard to
confidently place in SUBSTANTIALLY_SAME / DERIVATIVE / DISTINCT.

This CANNOT force a specific consensus outcome -- that's the entire point
of handing the judgement to independent validators. Whatever band comes
back is the real, honest result and is reported as such either way.

Run with:
    gltest tests/integration/test_live_inconclusive_attempt.py -v -s --network studionet
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


def test_attempt_genuine_model_inconclusive_live():
    accounts = get_accounts()
    submitter_a, submitter_b, challenger, resolver = (
        accounts[0], accounts[1], accounts[2], accounts[3],
    )
    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    contract_a = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_a)
    _pace()

    # Extremely short, generic, and structurally bare -- the kind of pair
    # where "is this reused expression or just two people independently
    # writing something equally minimal" is a genuinely hard call.
    original = "Hi"
    other = "Hey"

    tx = _with_retry(lambda: contract_a.submit(args=[original]).transact(value=500))
    print("submit(original) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    original_id = ids[-1]
    _pace()

    contract_b = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_b)
    _pace()
    tx = _with_retry(lambda: contract_b.submit(args=[other]).transact(value=500))
    print("submit(other) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    other_id = ids[-1]
    _pace()

    contract_challenger = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=challenger)
    _pace()
    tx = _with_retry(lambda: contract_challenger.challenge(args=[other_id]).transact(value=500))
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
    print("HONEST REAL RESULT -- band:", ch["band"], "| reason:", ch["reason"])
    assert ch["band"] in ("SUBSTANTIALLY_SAME", "DERIVATIVE", "DISTINCT", "INCONCLUSIVE")
