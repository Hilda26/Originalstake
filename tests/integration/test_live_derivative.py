"""
Another real, clean live scenario against the deployed v2 contract, aimed
at observing the DERIVATIVE band for the first time on real StudioNet
consensus (a closely-reworded paraphrase, not a near-verbatim copy).

Run with:
    gltest tests/integration/test_live_derivative.py -v -s --network studionet
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


def test_derivative_reworded_paraphrase_live():
    accounts = get_accounts()
    submitter_a, submitter_b, challenger, resolver = (
        accounts[0], accounts[1], accounts[2], accounts[3],
    )
    print("submitter_a:", submitter_a.address)
    print("submitter_b:", submitter_b.address)
    print("challenger: ", challenger.address)
    print("resolver:   ", resolver.address)

    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    contract_a = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_a)
    _pace()

    original_text = "Chase the sunrise, chase your dreams, and never let the moment slip away."
    reworded_text = "Follow the sunrise, follow your dreams -- don't let this moment get away from you."

    tx = _with_retry(lambda: contract_a.submit(args=[original_text]).transact(value=1200))
    print("submit(original) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    original_id = ids[-1]
    print("original_id:", original_id)
    _pace()

    contract_b = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_b)
    _pace()
    tx = _with_retry(lambda: contract_b.submit(args=[reworded_text]).transact(value=1200))
    print("submit(reworded) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    reworded_id = ids[-1]
    print("reworded_id:", reworded_id)
    _pace()

    preview = _with_retry(lambda: contract_a.preview_nearest_neighbor(args=[reworded_id]).call())
    print("preview_nearest_neighbor(reworded):", preview)
    _pace()

    contract_challenger = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=challenger)
    _pace()
    tx = _with_retry(lambda: contract_challenger.challenge(args=[reworded_id]).transact(value=1200))
    print("challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch_ids = _with_retry(lambda: contract_a.list_challenge_ids(args=[]).call())
    challenge_id = ch_ids[-1]
    print("challenge_id:", challenge_id)
    _pace()

    contract_resolver = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=resolver)
    _pace()
    tx = _with_retry(lambda: contract_resolver.resolve_challenge(args=[challenge_id]).transact())
    print("resolve_challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch = _with_retry(lambda: contract_a.get_challenge(args=[challenge_id]).call())
    print("Observed band:", ch["band"], "| reason:", ch["reason"])
    assert ch["band"] in ("SUBSTANTIALLY_SAME", "DERIVATIVE", "DISTINCT", "INCONCLUSIVE")

    print("\nDone. Real result observed on deployed contract:", CONTRACT_ADDRESS)
