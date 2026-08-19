"""
Shared fixtures/workarounds for OriginalStake direct-mode tests.

Same Windows fd-0 unlink workaround and warp_to() time helper as
project-1/tests/direct/conftest.py (see there for the detailed rationale) --
duplicated here rather than imported cross-project since each project's
test suite must stand alone.
"""

import os
import sys

_orig_unlink = os.unlink


def _safe_unlink(path, *args, **kwargs):
    try:
        _orig_unlink(path, *args, **kwargs)
    except PermissionError:
        pass


os.unlink = _safe_unlink


def warp_to(direct_vm, iso: str) -> None:
    """Advance the VM clock everywhere the contract can read it (see
    project-1's conftest.py for the full rationale: direct_vm.warp() alone
    only patches datetime.now(), not gl.message_raw/gl.message.raw)."""
    direct_vm.warp(iso)
    gl = sys.modules.get("genlayer.gl")
    if gl is None:
        return
    raw = getattr(gl, "message_raw", None)
    if isinstance(raw, dict):
        raw["datetime"] = iso
    nested = getattr(getattr(gl, "message", None), "raw", None)
    if isinstance(nested, dict):
        nested["datetime"] = iso
