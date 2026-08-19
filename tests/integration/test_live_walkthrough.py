"""
One-off live walkthrough against the ALREADY-DEPLOYED OriginalStake contract
on StudioNet (not a fresh deploy-per-run) -- this populates real on-chain
data on the exact address the frontend points at, and prints real
transaction hashes / observed outcomes for the README.

Run with:
    gltest tests/integration/test_live_walkthrough.py -v -s --network studionet

Requires gltest.config.yaml (already present) for network config and
funded accounts via get_accounts().
"""

import re
import time

from gltest import get_contract_factory, get_accounts
from gltest.assertions import tx_execution_succeeded

CONTRACT_ADDRESS = "0x15d23034427f84caECed16F8f21fB58C15B01BE7"
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


def test_live_walkthrough_on_deployed_contract():
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

    # ------------------------------------------------------------------
    # Scenario 1: a near-verbatim spelling variant -> expect a real
    # SUBSTANTIALLY_SAME judgement (the exact case already proven on a
    # throwaway deployment; reproducing it live on the persistent address).
    # ------------------------------------------------------------------
    original_text = "The old lighthouse stood watch over the harbour, its light cutting through the fog every night."
    variant_text = "The old lighthouse stood watch over the harbor, its light cutting through the fog every night."

    tx = _with_retry(lambda: contract_a.submit(args=[original_text]).transact(value=1000))
    print("submit(original) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    original_id = ids[-1]
    print("original_id:", original_id)
    _pace()

    contract_b = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=submitter_b)
    _pace()
    tx = _with_retry(lambda: contract_b.submit(args=[variant_text]).transact(value=1000))
    print("submit(variant) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    variant_id = ids[-1]
    print("variant_id:", variant_id)
    _pace()

    preview = _with_retry(lambda: contract_a.preview_nearest_neighbor(args=[variant_id]).call())
    print("preview_nearest_neighbor(variant):", preview)
    _pace()

    contract_challenger = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=challenger)
    _pace()
    tx = _with_retry(lambda: contract_challenger.challenge(args=[variant_id]).transact(value=1000))
    print("challenge(variant) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch_ids = _with_retry(lambda: contract_a.list_challenge_ids(args=[]).call())
    challenge_id_1 = ch_ids[-1]
    print("challenge_id_1:", challenge_id_1)
    _pace()

    contract_resolver = factory.build_contract(contract_address=CONTRACT_ADDRESS, account=resolver)
    _pace()
    tx = _with_retry(lambda: contract_resolver.resolve_challenge(args=[challenge_id_1]).transact())
    print("resolve_challenge(1) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch1 = _with_retry(lambda: contract_a.get_challenge(args=[challenge_id_1]).call())
    print("Observed band 1:", ch1["band"], "| reason:", ch1["reason"])
    _pace()

    # ------------------------------------------------------------------
    # Scenario 2: a genuinely unrelated submission challenged against the
    # nearest existing entry -> expect a real DISTINCT judgement, a band
    # not yet observed live on this series.
    # ------------------------------------------------------------------
    unrelated_text = "Quarterly subscription revenue grew twelve percent, driven mainly by renewals in the enterprise tier."

    tx = _with_retry(lambda: contract_b.submit(args=[unrelated_text]).transact(value=1000))
    print("submit(unrelated) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract_a.list_submission_ids(args=[]).call())
    unrelated_id = ids[-1]
    print("unrelated_id:", unrelated_id)
    _pace()

    preview2 = _with_retry(lambda: contract_a.preview_nearest_neighbor(args=[unrelated_id]).call())
    print("preview_nearest_neighbor(unrelated):", preview2)
    _pace()

    tx = _with_retry(lambda: contract_challenger.challenge(args=[unrelated_id]).transact(value=1000))
    print("challenge(unrelated) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch_ids = _with_retry(lambda: contract_a.list_challenge_ids(args=[]).call())
    challenge_id_2 = ch_ids[-1]
    print("challenge_id_2:", challenge_id_2)
    _pace()

    tx = _with_retry(lambda: contract_resolver.resolve_challenge(args=[challenge_id_2]).transact())
    print("resolve_challenge(2) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch2 = _with_retry(lambda: contract_a.get_challenge(args=[challenge_id_2]).call())
    print("Observed band 2:", ch2["band"], "| reason:", ch2["reason"])

    print("\nDone. Live contract now has real, browsable data at:", CONTRACT_ADDRESS)
