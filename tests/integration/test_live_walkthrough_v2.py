"""
Populates the v2 deployed OriginalStake contract with real data exercising
every v2 feature (search_similar, add_bounty, resolve with bounty payout)
so the live frontend has real browsable state.

Run with:
    gltest tests/integration/test_live_walkthrough_v2.py -v -s --network studionet
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


def test_populate_v2_contract_with_real_data():
    accounts = get_accounts()
    submitter_a, submitter_b, bounty_funder, challenger, resolver = (
        accounts[0], accounts[1], accounts[2], accounts[3], accounts[4],
    )
    print("submitter_a:  ", submitter_a.address)
    print("submitter_b:  ", submitter_b.address)
    print("bounty_funder:", bounty_funder.address)
    print("challenger:   ", challenger.address)
    print("resolver:     ", resolver.address)

    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    contract_a = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_a)
    _pace()

    # --- submission 1: a distinct original piece, browsable on its own ---
    tx = _with_retry(lambda: contract_a.submit(
        args=["A pale moon hangs low over the empty harbor, waiting for morning to arrive."]
    ).transact(value=1000))
    print("submit(A) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    sub_a_id = ids[-1]
    print("sub_a_id:", sub_a_id)
    _pace()

    # --- demonstrate search_similar finds it from a related query ---
    hits = _with_retry(lambda: contract_a.search_similar(args=["moon over the harbor at night", 5]).call())
    print("search_similar results:", hits)
    _pace()

    # --- someone crowdfunds a bounty on submission A to incentivize a challenge ---
    contract_funder = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=bounty_funder)
    _pace()
    tx = _with_retry(lambda: contract_funder.add_bounty(args=[sub_a_id]).transact(value=250))
    print("add_bounty tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    sub_a = _with_retry(lambda: contract_a.get_submission(args=[sub_a_id]).call())
    print("submission A after bounty:", sub_a)
    _pace()

    # --- submission 2: a near-duplicate of submission A ---
    contract_b = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_b)
    _pace()
    tx = _with_retry(lambda: contract_b.submit(
        args=["A pale moon hangs low over the empty harbour, waiting for morning to arrive."]
    ).transact(value=1000))
    print("submit(B, near-dup) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    sub_b_id = ids[-1]
    print("sub_b_id:", sub_b_id)
    _pace()

    preview = _with_retry(lambda: contract_a.preview_nearest_neighbor(args=[sub_b_id]).call())
    print("preview_nearest_neighbor(B):", preview)
    _pace()

    # --- challenge B, resolve, confirm bounty on A is untouched (B has none) ---
    contract_challenger = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=challenger)
    _pace()
    tx = _with_retry(lambda: contract_challenger.challenge(args=[sub_b_id]).transact(value=1000))
    print("challenge(B) tx status:", tx.get("status"))
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
    _pace()

    # --- track records for both submitter and challenger ---
    rec_b = _with_retry(lambda: contract_a.get_track_record(args=[submitter_b.address]).call())
    rec_challenger = _with_retry(lambda: contract_a.get_track_record(args=[challenger.address]).call())
    print("track_record(submitter_b):", rec_b)
    print("track_record(challenger):", rec_challenger)

    print("\nDone. v2 contract now has real, browsable data at:", CONTRACT_ADDRESS)
