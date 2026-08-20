"""HTTP and fixture transports for identity source adapters."""

from __future__ import annotations

import hashlib
import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, Optional


USER_AGENT = "resolve-chemical-identities/1.0"
DEFAULT_TIMEOUT = 20
DEFAULT_RETRIES = 1


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def payload_message(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    for key in ("message", "Message", "response", "Fault"):
        value = payload.get(key)
        if isinstance(value, str):
            return value[:1000]
    fault = payload.get("Fault")
    if isinstance(fault, dict):
        for key in ("Message", "Details", "Code"):
            value = fault.get(key)
            if value:
                return str(value)[:1000]
    return None


class HttpTransport:
    def __init__(
        self,
        timeout: int = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_RETRIES,
        clock: Callable[[], str] = now_utc,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.timeout = timeout
        self.retries = retries
        self.clock = clock
        self.sleep = sleep

    def _encode_body(
        self,
        body: Optional[dict[str, Any]],
        body_format: str,
    ) -> tuple[Optional[bytes], dict[str, str]]:
        headers = {
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        if body is None:
            return None, headers
        if body_format == "form":
            encoded = urllib.parse.urlencode(body).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            encoded = canonical_json(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        return encoded, headers

    def _success_result(
        self,
        requested_at: str,
        method: str,
        url: str,
        http_status: int,
        raw: bytes,
        request_body_sha256: Optional[str],
    ) -> dict[str, Any]:
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            return self._result(
                requested_at,
                method,
                url,
                "source_error",
                http_status,
                "invalid_json",
                str(error),
                None,
                raw,
                request_body_sha256,
            )
        return self._result(
            requested_at,
            method,
            url,
            "success",
            http_status,
            None,
            None,
            payload,
            raw,
            request_body_sha256,
        )

    def _http_error_result(
        self,
        error: urllib.error.HTTPError,
        requested_at: str,
        method: str,
        url: str,
        request_body_sha256: Optional[str],
    ) -> tuple[dict[str, Any], bool]:
        raw = error.read()
        http_status = int(error.code)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = None
        if http_status == 404:
            return (
                self._result(
                    requested_at,
                    method,
                    url,
                    "not_found",
                    http_status,
                    "not_found",
                    payload_message(payload) or "HTTP 404",
                    payload,
                    raw,
                    request_body_sha256,
                ),
                False,
            )
        retryable = http_status in {429, 500, 502, 503, 504}
        error_kind = (
            "rate_limited"
            if http_status == 429
            else "service_error"
            if retryable
            else "http_error"
        )
        return (
            self._result(
                requested_at,
                method,
                url,
                "source_error",
                http_status,
                error_kind,
                payload_message(payload) or f"HTTP {http_status}",
                payload,
                raw,
                request_body_sha256,
            ),
            retryable,
        )

    def _transport_error_result(
        self,
        error: BaseException,
        requested_at: str,
        method: str,
        url: str,
        request_body_sha256: Optional[str],
    ) -> dict[str, Any]:
        reason = getattr(error, "reason", error)
        error_kind = (
            "timeout"
            if isinstance(reason, (socket.timeout, TimeoutError))
            or "timed out" in str(reason).lower()
            else "transport_error"
        )
        return self._result(
            requested_at,
            method,
            url,
            "source_error",
            None,
            error_kind,
            str(reason),
            None,
            b"",
            request_body_sha256,
        )

    def request_json(
        self,
        fixture_key: str,
        method: str,
        url: str,
        body: Optional[dict[str, Any]] = None,
        body_format: str = "json",
    ) -> dict[str, Any]:
        del fixture_key
        requested_at = self.clock()
        encoded_body, headers = self._encode_body(body, body_format)
        request_body_sha256 = (
            hashlib.sha256(encoded_body).hexdigest() if encoded_body else None
        )
        for attempt in range(self.retries + 1):
            request = urllib.request.Request(
                url=url,
                data=encoded_body,
                headers=headers,
                method=method,
            )
            try:
                with urllib.request.urlopen(
                    request,
                    timeout=self.timeout,
                ) as response:
                    raw = response.read()
                    http_status = int(response.status)
                return self._success_result(
                    requested_at,
                    method,
                    url,
                    http_status,
                    raw,
                    request_body_sha256,
                )
            except urllib.error.HTTPError as error:
                result, retryable = self._http_error_result(
                    error,
                    requested_at,
                    method,
                    url,
                    request_body_sha256,
                )
                if retryable and attempt < self.retries:
                    self.sleep(min(2**attempt, 2))
                    continue
                return result
            except (
                urllib.error.URLError,
                socket.timeout,
                TimeoutError,
            ) as error:
                if attempt < self.retries:
                    self.sleep(min(2**attempt, 2))
                    continue
                return self._transport_error_result(
                    error,
                    requested_at,
                    method,
                    url,
                    request_body_sha256,
                )
        raise AssertionError("unreachable HTTP retry state")

    @staticmethod
    def _result(
        requested_at: str,
        method: str,
        url: str,
        status: str,
        http_status: Optional[int],
        error_kind: Optional[str],
        message: Optional[str],
        payload: Any,
        raw: bytes,
        request_body_sha256: Optional[str],
    ) -> dict[str, Any]:
        return {
            "requested_at_utc": requested_at,
            "method": method,
            "url": url,
            "status": status,
            "http_status": http_status,
            "error_kind": error_kind,
            "message": message,
            "payload": payload,
            "response_sha256": (hashlib.sha256(raw).hexdigest() if raw else None),
            "request_body_sha256": request_body_sha256,
        }


class FixtureTransport:
    """Return deterministic responses by fixture key."""

    def __init__(
        self,
        fixtures: dict[str, Any],
        clock: Callable[[], str] = now_utc,
    ):
        self.clock = clock
        self.fixtures: dict[str, list[dict[str, Any]]] = {}
        for key, value in fixtures.items():
            values = value if isinstance(value, list) else [value]
            self.fixtures[key] = [dict(item) for item in values]

    def request_json(
        self,
        fixture_key: str,
        method: str,
        url: str,
        body: Optional[dict[str, Any]] = None,
        body_format: str = "json",
    ) -> dict[str, Any]:
        del body_format
        queue = self.fixtures.get(fixture_key)
        if not queue and ":" in fixture_key:
            queue = self.fixtures.get(fixture_key.split(":", 1)[0])
        if not queue:
            return {
                "requested_at_utc": self.clock(),
                "method": method,
                "url": url,
                "status": "source_error",
                "http_status": None,
                "error_kind": "fixture_missing",
                "message": f"缺少离线响应：{fixture_key}",
                "payload": None,
                "response_sha256": None,
                "request_body_sha256": (sha256_json(body) if body else None),
            }
        fixture = queue.pop(0)
        status = fixture.get("status", "success")
        payload = fixture.get("payload")
        raw = canonical_json(payload).encode("utf-8") if payload is not None else b""
        return {
            "requested_at_utc": self.clock(),
            "method": method,
            "url": url,
            "status": status,
            "http_status": fixture.get(
                "http_status",
                (
                    200
                    if status == "success"
                    else 404
                    if status == "not_found"
                    else None
                ),
            ),
            "error_kind": fixture.get("error_kind"),
            "message": fixture.get("message") or payload_message(payload),
            "payload": payload,
            "response_sha256": (hashlib.sha256(raw).hexdigest() if raw else None),
            "request_body_sha256": sha256_json(body) if body else None,
        }


def source_log(
    source: str,
    operation: str,
    result: dict[str, Any],
    records_count: int,
    message: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "source": source,
        "operation": operation,
        "requested_at_utc": result["requested_at_utc"],
        "method": result["method"],
        "url": result["url"],
        "status": result["status"],
        "http_status": result.get("http_status"),
        "error_kind": result.get("error_kind"),
        "message": (message if message is not None else result.get("message")),
        "records_count": records_count,
        "response_sha256": result.get("response_sha256"),
        "request_body_sha256": result.get("request_body_sha256"),
    }
