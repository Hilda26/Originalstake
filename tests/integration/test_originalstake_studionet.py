"""
Integration tests for OriginalStake against real StudioNet consensus.

Run with:

    PYTHONIOENCODING=utf-8 gltest tests/integration/ -v -s --network studionet

Design notes (mirrors project-1/tests/integration/test_briefbond_studionet.py):

* The hosted studio.genlayer.com RPC enforces a hard 30 requests/minute cap
  (and ~500/hour). A fresh deploy per test blows through that fast, so this
  file deploys ONE contract for the whole sequential scenario and walks the
  real workflow end to end against it, exactly like a frontend would.
* `_with_retry` wraps every RPC-issuing call: on a rate-limit error it reads
  `retry_after_seconds` from the error payload when present (falling back to
  a fixed default), sleeps, and retries. This is a real, observed constraint
  of the free hosted Studio, documented in CONTRACT_STATUS.md, not a
  contract bug.
* Accounts are bound per-contract-instance via factory.build_contract(...,
  account=...) since ContractFunction.transact() has no per-call account
  override in this SDK version.
"""

import re
import time
from pathlib import Path

from gltest import get_contract_factory, get_accounts
from gltest.assertions import tx_execution_succeeded

CONTRACTS_DIR = Path(__file__).parent.parent.parent / "contract"

_PACE_SECONDS = 4
_RATE_LIMIT_DEFAULT_BACKOFF = 65
_MAX_RETRIES = 4


def _pace():
    time.sleep(_PACE_SECONDS)


def _extract_retry_after(exc: Exception) -> int:
    msg = str(exc)
    m = re.search(r"retry_after_seconds['\"]?\s*[:=]\s*(\d+)", msg)
    if m:
        return int(m.group(1))
    return _RATE_LIMIT_DEFAULT_BACKOFF


def _is_rate_limit_error(exc: Exception) -> bool:
    return "Rate limit exceeded" in str(exc) or "rate limit" in str(exc).lower()


def _with_retry(fn, *args, **kwargs):
    last_exc = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001 -- inspect, then re-raise or back off
            if not _is_rate_limit_error(e):
                raise
            last_exc = e
            wait = _extract_retry_after(e)
            print(f"[rate-limit] attempt {attempt + 1}/{_MAX_RETRIES + 1} hit rate limit, backing off {wait}s: {e}")
            time.sleep(wait)
    raise last_exc


def _deploy_as(account):
    factory = get_contract_factory(contract_file_path=CONTRACTS_DIR / "originalstake.py")
    contract = _with_retry(factory.deploy, args=[], account=account)
    return contract, factory


def test_originalstake_full_lifecycle_on_studionet():
    """
    One sequential scenario against a single deployed contract, covering:
      - deploy + initial view state
      - submit funds a bond and is listed, with a real on-chain embedding
        inserted into the VecDB
      - a second, near-duplicate submission is added so a real nearest-
        neighbor exists for the challenge round
      - access control: the submitter cannot challenge their own submission;
        an outsider can, and must post a counter-bond exactly equal to the
        challenged submission's bond
      - resolve_challenge is permissionless (called by a fourth account) and
        runs a real deterministic VecDB.knn lookup + a real non-deterministic
        prompt_comparative consensus round -- no web fetch anywhere
      - the resolution lands on one of the four legal bands and contract
        state (submission status) reflects that resolution correctly
    """
    accounts = get_accounts()
    submitter, near_dup_submitter, challenger, resolver = (
        accounts[0],
        accounts[0],
        accounts[1],
        accounts[2],
    )

    # ---- deploy + initial state -----------------------------------
    contract, factory = _deploy_as(submitter)
    _pace()

    count = _with_retry(lambda: contract.get_submission_count(args=[]).call())
    assert count == 0
    _pace()

    # ---- submit funds a bond, gets embedded + inserted into VecDB --
    original_text = "The lantern hums a quiet tune beneath the harbor mist tonight"
    tx = _with_retry(lambda: contract.submit(args=[original_text]).transact(value=1000))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract.list_submission_ids(args=[]).call())
    assert len(ids) == 1
    sub_id = ids[-1]
    _pace()

    sub = _with_retry(lambda: contract.get_submission(args=[sub_id]).call())
    assert sub["status"] == "OPEN"
    assert int(sub["bond"]) == 1000
    assert sub["submitter"].lower() == submitter.address.lower()
    _pace()

    # ---- a near-duplicate second submission gives knn a real neighbor --
    near_dup_text = "The lantern hums a quiet tune beneath the harbour mist tonight"
    tx = _with_retry(lambda: contract.submit(args=[near_dup_text]).transact(value=1000))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract.list_submission_ids(args=[]).call())
    assert len(ids) == 2
    challenged_id = ids[-1]
    _pace()

    # ---- access control: the submitter cannot challenge their own work --
    tx = _with_retry(lambda: contract.challenge(args=[challenged_id]).transact(value=1000))
    assert not tx_execution_succeeded(tx)
    _pace()

    # ---- challenge: counter-bond must exactly equal the submission bond --
    challenger_contract = factory.build_contract(contract_address=contract.address, account=challenger)
    _pace()
    tx = _with_retry(lambda: challenger_contract.challenge(args=[challenged_id]).transact(value=500))
    assert not tx_execution_succeeded(tx)
    _pace()

    tx = _with_retry(lambda: challenger_contract.challenge(args=[challenged_id]).transact(value=1000))
    assert tx_execution_succeeded(tx)
    _pace()

    challenge_ids = _with_retry(lambda: contract.list_challenge_ids(args=[]).call())
    assert len(challenge_ids) == 1
    challenge_id = challenge_ids[-1]
    _pace()

    ch = _with_retry(lambda: contract.get_challenge(args=[challenge_id]).call())
    assert ch["status"] == "OPEN"
    assert int(ch["counter_bond"]) == 1000
    _pace()

    sub = _with_retry(lambda: contract.get_submission(args=[challenged_id]).call())
    assert sub["status"] == "CHALLENGED"
    _pace()

    # ---- resolve_challenge: permissionless, real deterministic knn +
    #      real non-deterministic prompt_comparative consensus round -----
    resolver_contract = factory.build_contract(contract_address=contract.address, account=resolver)
    _pace()
    tx = _with_retry(lambda: resolver_contract.resolve_challenge(args=[challenge_id]).transact())
    print("resolve_challenge tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch = _with_retry(lambda: contract.get_challenge(args=[challenge_id]).call())
    print("Observed band:", ch["band"], "| reason:", ch["reason"], "| neighbor:", ch["neighbor_submission_id"])
    assert ch["status"] == "RESOLVED"
    assert ch["band"] in ("SUBSTANTIALLY_SAME", "DERIVATIVE", "DISTINCT", "INCONCLUSIVE")
    _pace()

    sub = _with_retry(lambda: contract.get_submission(args=[challenged_id]).call())
    print("Observed post-resolution submission status:", sub["status"])
    if ch["band"] in ("SUBSTANTIALLY_SAME", "DERIVATIVE"):
        assert sub["status"] == "FLAGGED"
    else:
        assert sub["status"] == "OPEN"

    # ---- idempotency: the same challenge cannot be resolved twice -------
    _pace()
    tx = _with_retry(lambda: resolver_contract.resolve_challenge(args=[challenge_id]).transact())
    assert not tx_execution_succeeded(tx)


def test_originalstake_no_neighbor_is_inconclusive_on_studionet():
    """
    A cheap, purely-deterministic-until-the-very-end scenario: a lone
    submission with no other corpus entry to compare against resolves
    INCONCLUSIVE without spending a real model round at all (the contract
    short-circuits before ever calling prompt_comparative). Kept as its own
    test/deploy since it exercises a materially different code path
    (`_find_nearest_neighbor` returning None) than the main lifecycle test.
    """
    accounts = get_accounts()
    submitter, challenger, resolver = accounts[0], accounts[1], accounts[2]

    contract, factory = _deploy_as(submitter)
    _pace()

    tx = _with_retry(
        lambda: contract.submit(args=["A single, solitary haiku with no neighbor in the corpus yet"]).transact(
            value=500
        )
    )
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract.list_submission_ids(args=[]).call())
    sub_id = ids[-1]
    _pace()

    challenger_contract = factory.build_contract(contract_address=contract.address, account=challenger)
    _pace()
    tx = _with_retry(lambda: challenger_contract.challenge(args=[sub_id]).transact(value=500))
    assert tx_execution_succeeded(tx)
    _pace()

    challenge_ids = _with_retry(lambda: contract.list_challenge_ids(args=[]).call())
    challenge_id = challenge_ids[-1]
    _pace()

    resolver_contract = factory.build_contract(contract_address=contract.address, account=resolver)
    _pace()
    tx = _with_retry(lambda: resolver_contract.resolve_challenge(args=[challenge_id]).transact())
    print("resolve_challenge (no-neighbor) tx status:", tx.get("status"))
    assert tx_execution_succeeded(tx)
    _pace()

    ch = _with_retry(lambda: contract.get_challenge(args=[challenge_id]).call())
    print("Observed no-neighbor band:", ch["band"])
    assert ch["band"] == "INCONCLUSIVE"
    assert ch["neighbor_submission_id"] is None

    sub = _with_retry(lambda: contract.get_submission(args=[sub_id]).call())
    assert sub["status"] == "OPEN"


def test_originalstake_bounty_paid_to_winning_challenger_on_studionet():
    """
    Real StudioNet scenario for the v2 `add_bounty` mechanic: a third party
    (not the submitter, not the challenger) crowdfunds a bounty on a
    submission, a challenger opens against a near-duplicate, resolve_challenge
    runs a real nondet consensus round, and -- if the challenger wins -- the
    accumulated bounty must be paid out ON TOP of the forfeited bond, with
    bounty_pool reset to zero afterward. If the real model instead lands on
    DISTINCT or INCONCLUSIVE, the bounty must be left untouched/rolled over
    -- both outcomes are asserted for real observed behavior, not mocked.
    """
    accounts = get_accounts()
    submitter, bounty_funder, challenger, resolver = (
        accounts[0],
        accounts[1],
        accounts[2],
        accounts[0],
    )

    contract, factory = _deploy_as(submitter)
    _pace()

    original_text = "A weathered lighthouse keeper counts the waves before dawn breaks"
    tx = _with_retry(lambda: contract.submit(args=[original_text]).transact(value=1000))
    assert tx_execution_succeeded(tx)
    _pace()

    near_dup_text = "A weathered lighthouse keeper counts the waves before dawn breaks softly"
    tx = _with_retry(lambda: contract.submit(args=[near_dup_text]).transact(value=1000))
    assert tx_execution_succeeded(tx)
    _pace()

    ids = _with_retry(lambda: contract.list_submission_ids(args=[]).call())
    assert len(ids) == 2
    challenged_id = ids[-1]
    _pace()

    # ---- a third party crowdfunds a bounty on the near-duplicate --------
    funder_contract = factory.build_contract(contract_address=contract.address, account=bounty_funder)
    _pace()
    tx = _with_retry(lambda: funder_contract.add_bounty(args=[challenged_id]).transact(value=300))
    assert tx_execution_succeeded(tx)
    _pace()

    sub = _with_retry(lambda: contract.get_submission(args=[challenged_id]).call())
    assert int(sub["bounty_pool"]) == 300
    assert int(sub["bounty_total"]) == 300
    _pace()

    challenger_contract = factory.build_contract(contract_address=contract.address, account=challenger)
    _pace()
    tx = _with_retry(lambda: challenger_contract.challenge(args=[challenged_id]).transact(value=1000))
    assert tx_execution_succeeded(tx)
    _pace()

    challenge_ids = _with_retry(lambda: contract.list_challenge_ids(args=[]).call())
    challenge_id = challenge_ids[-1]
    _pace()

    resolver_contract = factory.build_contract(contract_address=contract.address, account=resolver)
    _pace()
    tx = _with_retry(lambda: resolver_contract.resolve_challenge(args=[challenge_id]).transact())
    assert tx_execution_succeeded(tx)
    _pace()

    ch = _with_retry(lambda: contract.get_challenge(args=[challenge_id]).call())
    print("Observed bounty-scenario band:", ch["band"], "| reason:", ch["reason"])
    assert ch["band"] in ("SUBSTANTIALLY_SAME", "DERIVATIVE", "DISTINCT", "INCONCLUSIVE")
    _pace()

    sub = _with_retry(lambda: contract.get_submission(args=[challenged_id]).call())
    print("Observed post-resolution bounty_pool:", sub["bounty_pool"], "| bounty_total:", sub["bounty_total"])
    if ch["band"] in ("SUBSTANTIALLY_SAME", "DERIVATIVE"):
        # challenger won: bounty paid out and reset to zero; total unchanged
        assert int(sub["bounty_pool"]) == 0
        assert int(sub["bounty_total"]) == 300
        assert sub["status"] == "FLAGGED"
    else:
        # DISTINCT or INCONCLUSIVE: bounty rolls over untouched
        assert int(sub["bounty_pool"]) == 300
        assert int(sub["bounty_total"]) == 300
        assert sub["status"] == "OPEN"
