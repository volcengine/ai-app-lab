import contextvars

_session_id: contextvars.ContextVar[str] = contextvars.ContextVar("_account_id")


def set_session_id(val: str = "") -> None:
    _session_id.set(val)


def get_session_id(default_val: str = "") -> str:
    return _session_id.get(default_val)
