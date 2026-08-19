"""
Direct-mode tests for the OriginalStake contract.

Run with: pytest tests/direct/ -v

Mocking notes (see conftest.py / the gltest direct-mode loader):
  * `genlayer_embeddings.SentenceTransformer` is auto-mocked by the gltest
    direct-mode loader (gltest/direct/loader.py:_mock_embeddings_for_direct_mode)
    with a deterministic sha512-hash-derived 384-dim unit vector per input
    string. This is NOT something this test file configures -- it happens
    automatically the first time a contract method runs inside `direct_vm`.
    Two identical strings always embed to the identical vector; two
    different strings embed to (with overwhelming probability) different
    vectors, which is exactly what VecDB.knn needs to be exercised for real
    in these tests -- knn itself is real, deterministic numpy/cover-tree
    code, never mocked.
  * `gl.nondet.exec_prompt` (the one real nondet call in this contract) is
    mocked with `direct_vm.mock_llm(prompt_regex, json_response)`, exactly
    like project-1/tests/direct's pattern.
"""

import sys

import pytest

from conftest import warp_to

CONTRACT = "contract/originalstake.py"


def _deploy(direct_deploy):
    return direct_deploy(CONTRACT)


def _fund_and_submit(direct_vm, contract, submitter, value=1000, text="A short original tagline about foxes"):
    direct_vm.sender = submitter
    direct_vm.value = value
    sid = contract.submit(text)
    direct_vm.value = 0
    return sid


def _challenge(direct_vm, contract, challenger, sid, value=1000):
    direct_vm.sender = challenger
    direct_vm.value = value
    cid = contract.challenge(sid)
    direct_vm.value = 0
    return cid


def _mock_band(direct_vm, band, reason="mocked verdict"):
    direct_vm.mock_llm(r".*", '{"band": "%s", "reason": "%s"}' % (band, reason))


def _addr_hex(raw: bytes) -> str:
    """direct_alice/bob/charlie fixtures are raw 20-byte addresses; the
    contract's views return Address.as_hex (EIP-55 checksummed). eth_utils
    produces the identical checksum GenLayer's Address.as_hex uses."""
    from eth_utils import to_checksum_address

    return to_checksum_address(bytes(raw))


def _set_max_submissions(n: int) -> None:
    mod = sys.modules.get("_contract_originalstake")
    if mod is not None:
        mod.MAX_SUBMISSIONS = n


# ---------------------------------------------------------------------------
# submit -- happy path + validation
# ---------------------------------------------------------------------------


def test_submit_happy_path(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice)
    sub = c.get_submission(sid)
    assert sub["status"] == "OPEN"
    assert sub["bond"] == 1000
    assert sub["challenge_count"] == 0
    assert sub["text"] == "A short original tagline about foxes"


def test_submit_requires_funding(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with direct_vm.expect_revert("EXPECTED"):
        c.submit("no bond attached")


def test_submit_rejects_empty_text(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    with direct_vm.expect_revert("EXPECTED"):
        c.submit("")


def test_submit_rejects_oversized_text(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    with direct_vm.expect_revert("EXPECTED"):
        c.submit("x" * 500)


def test_submit_accepts_text_at_max_length(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    sid = c.submit("x" * 400)
    assert c.get_submission(sid)["text"] == "x" * 400


def test_submit_increments_id_and_count(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    s0 = _fund_and_submit(direct_vm, c, direct_alice, text="first piece text")
    s1 = _fund_and_submit(direct_vm, c, direct_alice, text="second piece text")
    assert s1 == s0 + 1
    assert c.get_submission_count() == 2


def test_submit_enforces_corpus_cap(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, text="the only slot available")
    _set_max_submissions(1)
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    with direct_vm.expect_revert("EXPECTED"):
        c.submit("this should not fit, corpus is full")


# ---------------------------------------------------------------------------
# challenge -- access control + bond validation
# ---------------------------------------------------------------------------


def test_challenge_happy_path(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice)
    cid = _challenge(direct_vm, c, direct_bob, sid)
    ch = c.get_challenge(cid)
    assert ch["submission_id"] == sid
    assert ch["status"] == "OPEN"
    assert ch["counter_bond"] == 1000
    assert c.get_submission(sid)["status"] == "CHALLENGED"


def test_challenge_submitter_cannot_challenge_own(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    with direct_vm.expect_revert("EXPECTED"):
        c.challenge(sid)


def test_challenge_requires_matching_counter_bond_too_low(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000)
    direct_vm.sender = direct_bob
    direct_vm.value = 500
    with direct_vm.expect_revert("EXPECTED"):
        c.challenge(sid)


def test_challenge_requires_matching_counter_bond_too_high(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000)
    direct_vm.sender = direct_bob
    direct_vm.value = 2000
    with direct_vm.expect_revert("EXPECTED"):
        c.challenge(sid)


def test_challenge_nonexistent_submission_reverts(direct_vm, direct_deploy, direct_bob):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_bob
    direct_vm.value = 1000
    with direct_vm.expect_revert("EXPECTED"):
        c.challenge(999)


def test_challenge_cannot_double_challenge_while_open(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice)
    _challenge(direct_vm, c, direct_bob, sid)
    direct_vm.sender = direct_charlie
    direct_vm.value = 1000
    with direct_vm.expect_revert("EXPECTED"):
        c.challenge(sid)


# ---------------------------------------------------------------------------
# resolve_challenge -- INCONCLUSIVE with no neighbor at all (no nondet round)
# ---------------------------------------------------------------------------


def test_resolve_no_neighbor_is_inconclusive_and_refunds_both(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the only entry in this whole corpus")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)
    assert band == "INCONCLUSIVE"
    ch = c.get_challenge(cid)
    assert ch["status"] == "RESOLVED"
    assert ch["neighbor_submission_id"] is None
    sub = c.get_submission(sid)
    assert sub["status"] == "OPEN"


# ---------------------------------------------------------------------------
# resolve_challenge -- the four real bands, each via a distinct neighbor
# ---------------------------------------------------------------------------


def test_resolve_substantially_same_challenger_wins(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "SUBSTANTIALLY_SAME")
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "SUBSTANTIALLY_SAME"
    ch = c.get_challenge(cid)
    assert ch["status"] == "RESOLVED"
    assert ch["neighbor_submission_id"] is not None
    sub = c.get_submission(sid)
    assert sub["status"] == "FLAGGED"


def test_resolve_derivative_challenger_wins(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "DERIVATIVE")
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "DERIVATIVE"
    sub = c.get_submission(sid)
    assert sub["status"] == "FLAGGED"


def test_resolve_distinct_challenger_loses(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "DISTINCT"
    sub = c.get_submission(sid)
    assert sub["status"] == "OPEN"


def test_resolve_model_inconclusive_refunds_both(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "INCONCLUSIVE")
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "INCONCLUSIVE"
    sub = c.get_submission(sid)
    assert sub["status"] == "OPEN"


# ---------------------------------------------------------------------------
# resolve_challenge -- replay / idempotency
# ---------------------------------------------------------------------------


def test_resolve_challenge_cannot_be_resolved_twice(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    with direct_vm.expect_revert("EXPECTED"):
        c.resolve_challenge(cid)


def test_resolve_nonexistent_challenge_reverts(direct_vm, direct_deploy, direct_charlie):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("EXPECTED"):
        c.resolve_challenge(999)


def test_flagged_submission_cannot_be_challenged_again(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "SUBSTANTIALLY_SAME")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    direct_vm.sender = direct_charlie
    direct_vm.value = 1000
    with direct_vm.expect_revert("EXPECTED"):
        c.challenge(sid)


def test_distinct_submission_can_be_challenged_again_by_a_fresh_challenger(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """After DISTINCT, the submission returns to OPEN -- a different
    challenger may open a fresh challenge later (documented behavior:
    DISTINCT does not permanently shield a submission from all future
    scrutiny, only defeats this particular challenger's claim)."""
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid1 = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid1)

    assert c.get_submission(sid)["status"] == "OPEN"
    cid2 = _challenge(direct_vm, c, direct_charlie, sid, value=1000)
    assert cid2 != cid1
    assert c.get_submission(sid)["status"] == "CHALLENGED"


def test_inconclusive_submission_can_be_rechallenged(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid1 = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "INCONCLUSIVE")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid1)

    assert c.get_submission(sid)["status"] == "OPEN"
    cid2 = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    assert cid2 != cid1


# ---------------------------------------------------------------------------
# nearest-neighbor lookup (deterministic VecDB.knn, no model involved)
# ---------------------------------------------------------------------------


def test_preview_nearest_neighbor_finds_something_once_corpus_has_2(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    s0 = _fund_and_submit(direct_vm, c, direct_alice, value=500, text="first submission in the corpus")
    s1 = _fund_and_submit(direct_vm, c, direct_alice, value=500, text="second submission in the corpus")
    preview = c.preview_nearest_neighbor(s1)
    assert preview["found"] is True
    assert preview["neighbor_id"] == s0


def test_preview_nearest_neighbor_none_when_alone(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=500, text="the only submission")
    preview = c.preview_nearest_neighbor(sid)
    assert preview["found"] is False


def test_preview_nearest_neighbor_nonexistent_submission_reverts(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("EXPECTED"):
        c.preview_nearest_neighbor(999)


# ---------------------------------------------------------------------------
# views / listing / pagination
# ---------------------------------------------------------------------------


def test_list_submission_ids(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    s0 = _fund_and_submit(direct_vm, c, direct_alice, text="alpha entry text here")
    s1 = _fund_and_submit(direct_vm, c, direct_alice, text="beta entry text here")
    ids = c.list_submission_ids()
    assert set(ids) == {s0, s1}


def test_list_submissions_page(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    for i in range(5):
        _fund_and_submit(direct_vm, c, direct_alice, text=f"submission number {i} in the page test")
    page = c.list_submissions_page(0, 3)
    assert len(page) == 3
    page2 = c.list_submissions_page(3, 3)
    assert len(page2) == 2


def test_list_challenges_for_submission(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid1 = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "INCONCLUSIVE")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid1)

    cid2 = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    listed = c.list_challenges_for_submission(sid)
    assert {ch["id"] for ch in listed} == {cid1, cid2}


def test_get_challenge_count(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=500, text="submission needing a challenge")
    assert c.get_challenge_count() == 0
    _challenge(direct_vm, c, direct_bob, sid, value=500)
    assert c.get_challenge_count() == 1


def test_get_submission_nonexistent_reverts(direct_vm, direct_deploy):
    c = _deploy(direct_deploy)
    with direct_vm.expect_revert("EXPECTED"):
        c.get_submission(999)


def test_get_challenge_nonexistent_reverts(direct_vm, direct_deploy):
    c = _deploy(direct_deploy)
    with direct_vm.expect_revert("EXPECTED"):
        c.get_challenge(999)


# ---------------------------------------------------------------------------
# defensive model-output parsing (malformed / fenced / non-JSON output)
# ---------------------------------------------------------------------------


def test_resolve_malformed_model_output_falls_back_to_inconclusive(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    direct_vm.mock_llm(r".*", "not json at all, just prose")
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "INCONCLUSIVE"
    assert c.get_submission(sid)["status"] == "OPEN"


def test_resolve_fenced_json_model_output_is_parsed(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    direct_vm.mock_llm(r".*", '```json\n{"band": "DISTINCT", "reason": "independent expression"}\n```')
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "DISTINCT"


def test_resolve_invalid_band_value_falls_back_to_inconclusive(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    direct_vm.mock_llm(r".*", '{"band": "TOTALLY_MADE_UP", "reason": "nonsense"}')
    direct_vm.sender = direct_charlie
    band = c.resolve_challenge(cid)

    assert band == "INCONCLUSIVE"


# ---------------------------------------------------------------------------
# time handling -- created_at/updated_at carry the message datetime, both
# sides of a warp are exercised (see the spec's Time-handling rules)
# ---------------------------------------------------------------------------


def test_submission_timestamps_reflect_message_datetime(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, text="a timestamped submission entry")
    sub = c.get_submission(sid)
    assert sub["created_at"] == "2026-01-01T00:00:00.000000Z"
    assert sub["created_at"].endswith("Z")

    warp_to(direct_vm, "2026-06-01T00:00:00.000000Z")
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    sid2 = c.submit("second submission after the warp")
    sub2 = c.get_submission(sid2)
    assert sub2["created_at"] == "2026-06-01T00:00:00.000000Z"
    assert sub2["created_at"] != sub["created_at"]


def test_challenge_and_resolution_timestamps_after_warp(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-02-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")

    warp_to(direct_vm, "2026-02-02T00:00:00.000000Z")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    ch = c.get_challenge(cid)
    assert ch["created_at"] == "2026-02-02T00:00:00.000000Z"

    warp_to(direct_vm, "2026-02-03T00:00:00.000000Z")
    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)
    ch = c.get_challenge(cid)
    assert ch["resolved_at"] == "2026-02-03T00:00:00.000000Z"


# ---------------------------------------------------------------------------
# value-moving branches: assert relative escrow accounting via view state
# (Studio-style balance assertions aren't available in direct mode; state
# transitions -- FLAGGED vs OPEN -- are the observable proxy for "funds
# moved", exercised on every band above and reconfirmed here in one place)
# ---------------------------------------------------------------------------


def test_all_four_bands_produce_distinct_terminal_states(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")

    results = {}
    for band in ("SUBSTANTIALLY_SAME", "DERIVATIVE", "DISTINCT", "INCONCLUSIVE"):
        sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text=f"challenged text variant for {band}")
        cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
        direct_vm.clear_mocks()
        _mock_band(direct_vm, band)
        direct_vm.sender = direct_charlie
        got = c.resolve_challenge(cid)
        results[band] = (got, c.get_submission(sid)["status"])

    assert results["SUBSTANTIALLY_SAME"] == ("SUBSTANTIALLY_SAME", "FLAGGED")
    assert results["DERIVATIVE"] == ("DERIVATIVE", "FLAGGED")
    assert results["DISTINCT"] == ("DISTINCT", "OPEN")
    assert results["INCONCLUSIVE"] == ("INCONCLUSIVE", "OPEN")


def test_resolve_challenge_is_permissionless(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Neither the submitter nor the challenger is required to call
    resolve_challenge -- a fully unrelated third party may."""
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie  # neither submitter (alice) nor challenger (bob)
    band = c.resolve_challenge(cid)
    assert band == "DISTINCT"


# ---------------------------------------------------------------------------
# search_similar -- deterministic corpus-wide vector search
# ---------------------------------------------------------------------------


def test_search_similar_empty_corpus_returns_empty_list(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_alice
    assert c.search_similar("anything at all", 5) == []


def test_search_similar_single_entry(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, text="a lonely tagline about rivers")
    direct_vm.sender = direct_alice
    results = c.search_similar("a lonely tagline about rivers", 5)
    assert len(results) == 1
    assert results[0]["submission_id"] == sid
    assert results[0]["text"] == "a lonely tagline about rivers"
    assert results[0]["submitter"] == c.get_submission(sid)["submitter"]
    assert results[0]["status"] == "OPEN"


def test_search_similar_multiple_entries_ranked(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    s0 = _fund_and_submit(direct_vm, c, direct_alice, text="foxes running through golden fields")
    s1 = _fund_and_submit(direct_vm, c, direct_alice, text="a spreadsheet of quarterly tax filings")
    results = c.search_similar("foxes running through golden fields", 5)
    ids = [r["submission_id"] for r in results]
    assert s0 in ids and s1 in ids
    assert ids[0] == s0  # exact text match should rank nearest to itself


def test_search_similar_k_clamped_to_corpus_size(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, text="only one entry exists here")
    results = c.search_similar("only one entry exists here", 50)
    assert len(results) == 1


def test_search_similar_k_capped_at_max(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    for i in range(25):
        _fund_and_submit(direct_vm, c, direct_alice, text=f"corpus filler entry number {i} here")
    results = c.search_similar("corpus filler entry number 0 here", 1000)
    assert len(results) == 20  # MAX_SEARCH_K


def test_search_similar_rejects_empty_query(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, text="something in the corpus")
    with direct_vm.expect_revert("EXPECTED"):
        c.search_similar("", 5)


def test_search_similar_rejects_zero_k(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, text="something in the corpus")
    with direct_vm.expect_revert("EXPECTED"):
        c.search_similar("something in the corpus", 0)


# ---------------------------------------------------------------------------
# bounties -- crowdfunded flag incentive, payout-on-win, rollover otherwise
# ---------------------------------------------------------------------------


def test_add_bounty_accumulates(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, text="submission worth flagging maybe")
    direct_vm.sender = direct_bob
    direct_vm.value = 200
    c.add_bounty(sid)
    direct_vm.sender = direct_charlie
    direct_vm.value = 300
    c.add_bounty(sid)
    direct_vm.value = 0
    sub = c.get_submission(sid)
    assert sub["bounty_pool"] == 500
    assert sub["bounty_total"] == 500


def test_add_bounty_requires_value(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, text="submission worth flagging maybe")
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    with direct_vm.expect_revert("EXPECTED"):
        c.add_bounty(sid)


def test_add_bounty_nonexistent_submission_reverts(direct_vm, direct_deploy, direct_bob):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_bob
    direct_vm.value = 100
    with direct_vm.expect_revert("EXPECTED"):
        c.add_bounty(999)


def test_bounty_paid_to_challenger_on_win(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")

    direct_vm.sender = direct_alice
    direct_vm.value = 400
    c.add_bounty(sid)
    direct_vm.value = 0

    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    _mock_band(direct_vm, "SUBSTANTIALLY_SAME")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    sub = c.get_submission(sid)
    assert sub["bounty_pool"] == 0  # paid out and reset
    assert sub["bounty_total"] == 400  # historical total is not reset


def test_bounty_rolls_over_on_distinct_loss(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")

    direct_vm.sender = direct_alice
    direct_vm.value = 400
    c.add_bounty(sid)
    direct_vm.value = 0

    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    sub = c.get_submission(sid)
    assert sub["bounty_pool"] == 400  # untouched, rolled over
    assert sub["bounty_total"] == 400


def test_bounty_rolls_over_on_inconclusive(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")

    direct_vm.sender = direct_bob
    direct_vm.value = 150
    c.add_bounty(sid)
    direct_vm.value = 0

    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    _mock_band(direct_vm, "INCONCLUSIVE")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    sub = c.get_submission(sid)
    assert sub["bounty_pool"] == 150
    assert sub["bounty_total"] == 150


def test_bounty_survives_and_pays_out_on_second_challenge(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """Bounty rolls over through an INCONCLUSIVE, then pays out to a
    *later* challenger who actually wins."""
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")

    direct_vm.sender = direct_alice
    direct_vm.value = 100
    c.add_bounty(sid)
    direct_vm.value = 0

    cid1 = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    _mock_band(direct_vm, "INCONCLUSIVE")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid1)
    assert c.get_submission(sid)["bounty_pool"] == 100

    cid2 = _challenge(direct_vm, c, direct_charlie, sid, value=1000)
    direct_vm.clear_mocks()
    _mock_band(direct_vm, "DERIVATIVE")
    direct_vm.sender = direct_bob
    c.resolve_challenge(cid2)
    sub = c.get_submission(sid)
    assert sub["bounty_pool"] == 0
    assert sub["bounty_total"] == 100


# ---------------------------------------------------------------------------
# expire_stale_challenge -- permissionless time-based INCONCLUSIVE settlement
# ---------------------------------------------------------------------------


def test_expire_stale_challenge_before_threshold_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    warp_to(direct_vm, "2026-01-02T00:00:00.000000Z")  # only 1 day, threshold is 3
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("EXPECTED"):
        c.expire_stale_challenge(cid)


def test_expire_stale_challenge_exactly_at_threshold_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    """Exactly-at-threshold is NOT yet expired -- strictly-greater-than is
    required, symmetric with the rest of this series' deadline semantics."""
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    warp_to(direct_vm, "2026-01-04T00:00:00.000000Z")  # exactly 3 days later
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("EXPECTED"):
        c.expire_stale_challenge(cid)


def test_expire_stale_challenge_after_threshold_settles_inconclusive(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    warp_to(direct_vm, "2026-01-04T00:00:00.000001Z")  # just past 3 days
    direct_vm.sender = direct_charlie
    c.expire_stale_challenge(cid)

    ch = c.get_challenge(cid)
    assert ch["status"] == "RESOLVED"
    assert ch["band"] == "INCONCLUSIVE"
    sub = c.get_submission(sid)
    assert sub["status"] == "OPEN"


def test_expire_stale_challenge_permissionless(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Anyone -- not just a party to the challenge -- may call this."""
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    warp_to(direct_vm, "2026-01-10T00:00:00.000000Z")
    direct_vm.sender = direct_charlie  # a totally unrelated third party
    c.expire_stale_challenge(cid)
    assert c.get_challenge(cid)["status"] == "RESOLVED"


def test_expire_stale_challenge_already_resolved_reverts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)
    with direct_vm.expect_revert("EXPECTED"):
        c.expire_stale_challenge(cid)


def test_expire_stale_challenge_nonexistent_reverts(direct_vm, direct_deploy, direct_charlie):
    c = _deploy(direct_deploy)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("EXPECTED"):
        c.expire_stale_challenge(999)


def test_expire_stale_challenge_bounty_rolls_over(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")

    direct_vm.sender = direct_alice
    direct_vm.value = 250
    c.add_bounty(sid)
    direct_vm.value = 0

    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    warp_to(direct_vm, "2026-01-05T00:00:00.000000Z")
    direct_vm.sender = direct_charlie
    c.expire_stale_challenge(cid)

    sub = c.get_submission(sid)
    assert sub["bounty_pool"] == 250


# ---------------------------------------------------------------------------
# track record -- deterministic per-address counters, no privileged editor
# ---------------------------------------------------------------------------


def test_track_record_defaults_to_zero_for_unknown_address(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    rec = c.get_track_record(_addr_hex(direct_alice))
    assert rec == {
        "address": _addr_hex(direct_alice),
        "submissions_made": 0,
        "times_flagged": 0,
        "challenges_opened": 0,
        "challenges_won": 0,
        "challenges_lost": 0,
    }


def test_track_record_submissions_made_increments(direct_vm, direct_deploy, direct_alice):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, text="first piece of writing here")
    _fund_and_submit(direct_vm, c, direct_alice, text="second piece of writing here")
    rec = c.get_track_record(_addr_hex(direct_alice))
    assert rec["submissions_made"] == 2


def test_track_record_challenges_opened_increments(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = _deploy(direct_deploy)
    sid = _fund_and_submit(direct_vm, c, direct_alice, text="submission open to challenge")
    _challenge(direct_vm, c, direct_bob, sid, value=1000)
    rec = c.get_track_record(_addr_hex(direct_bob))
    assert rec["challenges_opened"] == 1


def test_track_record_win_lose_flag_counters(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "SUBSTANTIALLY_SAME")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    alice_rec = c.get_track_record(_addr_hex(direct_alice))
    bob_rec = c.get_track_record(_addr_hex(direct_bob))
    assert alice_rec["times_flagged"] == 1
    assert bob_rec["challenges_won"] == 1


def test_track_record_challenges_lost_on_distinct(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "DISTINCT")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    bob_rec = c.get_track_record(_addr_hex(direct_bob))
    assert bob_rec["challenges_lost"] == 1
    alice_rec = c.get_track_record(_addr_hex(direct_alice))
    assert alice_rec["times_flagged"] == 0


def test_track_record_inconclusive_does_not_change_win_loss_counters(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)

    _mock_band(direct_vm, "INCONCLUSIVE")
    direct_vm.sender = direct_charlie
    c.resolve_challenge(cid)

    bob_rec = c.get_track_record(_addr_hex(direct_bob))
    alice_rec = c.get_track_record(_addr_hex(direct_alice))
    assert bob_rec["challenges_won"] == 0
    assert bob_rec["challenges_lost"] == 0
    assert alice_rec["times_flagged"] == 0


def test_track_record_expire_stale_challenge_does_not_change_win_loss_counters(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    c = _deploy(direct_deploy)
    _fund_and_submit(direct_vm, c, direct_alice, value=500, text="a completely unrelated neighbor entry")
    warp_to(direct_vm, "2026-01-01T00:00:00.000000Z")
    sid = _fund_and_submit(direct_vm, c, direct_alice, value=1000, text="the challenged submission text")
    cid = _challenge(direct_vm, c, direct_bob, sid, value=1000)
    warp_to(direct_vm, "2026-01-10T00:00:00.000000Z")
    direct_vm.sender = direct_charlie
    c.expire_stale_challenge(cid)

    bob_rec = c.get_track_record(_addr_hex(direct_bob))
    assert bob_rec["challenges_won"] == 0
    assert bob_rec["challenges_lost"] == 0


def test_track_record_has_no_privileged_editor(direct_vm, direct_deploy):
    """There must be no method to directly set track-record counters --
    the only surface is get_track_record (a view). This test documents the
    invariant by asserting the contract object has no such write method."""
    c = _deploy(direct_deploy)
    assert not hasattr(c, "set_track_record")
    assert not hasattr(c, "edit_track_record")
