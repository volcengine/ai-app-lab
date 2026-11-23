import base64
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# Placeholder credentials exercise local STS signing without calling cloud APIs.
os.environ.update(
    {
        "ACEP_AK": "test-long-term-ak",
        "ACEP_SK": "test-long-term-sk",
        "ACEP_ACCOUNT_ID": "test-account",
        "TOS_BUCKET": "test-screenshots",
        "TOS_REGION": "cn-beijing",
        "TOS_ENDPOINT": "https://tos.invalid",
        "ARK_API_KEY": "test-ark-key",
        "VOLC_ACCESSKEY": "test-long-term-ak",
        "VOLC_SECRETKEY": "test-long-term-sk",
    }
)

ALICE_TOKEN = "a" * 43
BOB_TOKEN = "b" * 43
ALICE_OTHER_DEVICE_TOKEN = "c" * 43
GRANTS = [
    {
        "token": ALICE_TOKEN,
        "account_id": "alice",
        "product_id": "prod-1",
        "pod_id": "pod-1",
        "expires_at": int(time.time()) + 3600,
    },
    {
        "token": BOB_TOKEN,
        "account_id": "bob",
        "product_id": "prod-2",
        "pod_id": "pod-2",
        "expires_at": int(time.time()) + 3600,
    },
    {
        "token": ALICE_OTHER_DEVICE_TOKEN,
        "account_id": "alice",
        "product_id": "prod-2",
        "pod_id": "pod-2",
        "expires_at": int(time.time()) + 3600,
    },
]
os.environ["MOBILE_AGENT_ACCESS_GRANTS"] = json.dumps(GRANTS)

from app import app
from mobile_agent.middleware.auth import load_access_grants
from mobile_agent.routers import agent as agent_router
from mobile_agent.service.pod.manager import pod_manager
from mobile_agent.service.session.manager import session_manager


@pytest.fixture
def client():
    session_manager.thread_map.clear()
    with TestClient(app) as client:
        yield client
    session_manager.thread_map.clear()


@pytest.mark.parametrize(
    "path,body",
    [
        ("session/create", {"product_id": "prod-1", "pod_id": "pod-1"}),
        ("session/reset", {"thread_id": "victim"}),
        ("agent/stream", {"thread_id": "victim", "message": "hello"}),
        ("agent/cancel", {"thread_id": "victim"}),
    ],
)
def test_unauthenticated_requests_are_rejected_before_side_effects(client, path, body):
    response = client.post(f"/mobile-use/api/v1/{path}", json=body)
    assert response.status_code == 401
    assert "AccessKeyID" not in response.text
    assert not session_manager.thread_map


def test_mcp_authorization_uses_temporary_credentials():
    resource = pod_manager.get_resource(device_id="pod-1", product_id="prod-1")
    authorization = json.loads(base64.b64decode(resource["auth_info"]["authorization"]))
    assert authorization["AccessKeyId"] != os.environ["ACEP_AK"]
    assert authorization["SecretAccessKey"] != os.environ["ACEP_SK"]
    assert authorization["SessionToken"]


def create_session(client):
    response = client.post(
        "/mobile-use/api/v1/session/create",
        headers={"Authorization": f"Bearer {ALICE_TOKEN}"},
        json={"product_id": "prod-1", "pod_id": "pod-1"},
    )
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    return response.json()


@pytest.mark.parametrize(
    "authorization", ["", "Bearer 123", "Basic " + ALICE_TOKEN, "Bearer " + "x" * 43]
)
def test_invalid_credentials_cannot_issue_sts(client, authorization):
    with patch.object(pod_manager, "get_resource") as allocate:
        response = client.post(
            "/mobile-use/api/v1/session/create",
            headers={"Authorization": authorization, "X-Account-Id": "alice"},
            json={"product_id": "prod-1", "pod_id": "pod-1"},
        )
    assert response.status_code == 401
    allocate.assert_not_called()


@pytest.mark.parametrize(
    "path", ["/docs", "/openapi.json", "/mobile-use/api/v1/agent/run", "/unknown"]
)
def test_all_paths_require_authentication(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("token", [BOB_TOKEN, ALICE_OTHER_DEVICE_TOKEN])
@pytest.mark.parametrize(
    "path", ["session/create", "session/reset", "agent/stream", "agent/cancel"]
)
def test_foreign_thread_cannot_be_replayed_or_modified(client, token, path):
    created = create_session(client)
    thread_id = created["thread_id"]
    session = session_manager.thread_map[thread_id]
    body = {
        "thread_id": thread_id,
        "message": "hello",
        "product_id": "prod-2",
        "pod_id": "pod-2",
    }
    with (
        patch.object(pod_manager, "get_resource") as allocate,
        patch.object(agent_router, "MobileUseAgent") as agent,
    ):
        response = client.post(
            f"/mobile-use/api/v1/{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}", "X-Account-Id": "alice"},
        )
    assert response.status_code == 403
    assert "AccessKeyID" not in response.text
    assert session_manager.thread_map[thread_id] == session
    assert session.sse_connection is None
    allocate.assert_not_called()
    agent.assert_not_called()


@pytest.mark.parametrize(
    "product_id,pod_id",
    [("prod-2", "pod-1"), ("prod-1", "pod-2"), ("*", "pod-1"), ("prod-1", "pod-1/*")],
)
def test_caller_cannot_select_an_ungranted_device(client, product_id, pod_id):
    with patch.object(pod_manager, "get_resource") as allocate:
        response = client.post(
            "/mobile-use/api/v1/session/create",
            json={"product_id": product_id, "pod_id": pod_id},
            headers={"Authorization": f"Bearer {ALICE_TOKEN}"},
        )
    assert response.status_code == 403
    allocate.assert_not_called()


def test_owner_can_renew_reset_run_and_cancel(client):
    created = create_session(client)
    thread_id = created["thread_id"]
    headers = {"Authorization": f"Bearer {ALICE_TOKEN}"}
    session = session_manager.thread_map[thread_id]
    assert session.account_id == "alice"
    renewed = client.post(
        "/mobile-use/api/v1/session/create",
        headers=headers,
        json={
            "thread_id": thread_id,
            "product_id": "prod-1",
            "pod_id": "pod-1",
        },
    )
    assert renewed.status_code == 200
    assert renewed.json()["thread_id"] == thread_id
    assert renewed.json()["chat_thread_id"] == created["chat_thread_id"]
    reset = client.post(
        "/mobile-use/api/v1/session/reset",
        headers=headers,
        json={"thread_id": thread_id},
    )
    assert reset.status_code == 200
    assert reset.json()["chat_thread_id"] != created["chat_thread_id"]

    # Only replace cloud/LLM execution; authentication and stream routing stay real.
    with (
        patch.object(agent_router, "MobileUseAgent") as agent,
        patch.object(agent_router, "stream_generator") as stream,
    ):
        agent.return_value.initialize = AsyncMock()
        stream.return_value = iter(["data: success\n\n"])
        response = client.post(
            "/mobile-use/api/v1/agent/stream",
            headers=headers,
            json={"thread_id": thread_id, "message": "hello"},
        )
        assert response.status_code == 200
        assert "data: success" in response.text
        agent.return_value.initialize.assert_awaited_once()
    assert (
        client.post(
            "/mobile-use/api/v1/agent/cancel",
            headers=headers,
            json={"thread_id": thread_id},
        ).status_code
        == 200
    )
    assert session_manager.thread_map[thread_id].sse_connection.is_set()


def test_sts_actions_resources_and_lifetime_are_restricted():
    with patch.object(
        pod_manager.volc_client, "sign_sts2", wraps=pod_manager.volc_client.sign_sts2
    ) as sign:
        resource = pod_manager.get_resource(device_id="pod-1", product_id="prod-1")
    policies = [call.kwargs["policy"] for call in sign.call_args_list]
    assert policies[0]["Statement"] == [
        {
            "Effect": "Allow",
            "Action": ["ACEP:PodStart"],
            "Resource": ["trn:ACEP::test-account:pod_id/pod-1"],
        }
    ]
    assert set(policies[1]["Statement"][0]["Action"]) == {
        "ACEP:RunSyncCommand",
        "ACEP:AutoInstallApp",
        "ACEP:LaunchApp",
        "ACEP:CloseApp",
        "ACEP:GetPodAppList",
    }
    assert policies[1]["Statement"][0]["Resource"] == [
        "trn:ACEP::test-account:pod_id/pod-1"
    ]
    assert policies[1]["Statement"][1] == {
        "Effect": "Allow",
        "Action": ["tos:PutObject", "tos:GetObject"],
        "Resource": ["trn:tos:::test-screenshots/*"],
    }
    current = datetime.fromisoformat(resource["auth_info"]["current_time"])
    expiry = datetime.fromisoformat(resource["auth_info"]["expired_time"])
    assert (expiry - current).total_seconds() == 1800


@pytest.mark.parametrize(
    "config",
    [
        "",
        "[]",
        "invalid",
        '[{"token":"secret"}]',
        json.dumps(GRANTS + [GRANTS[0]]),
        json.dumps([{**GRANTS[0], "product_id": "*"}]),
        json.dumps([{**GRANTS[0], "expires_at": int(time.time()) + 86400}]),
    ],
)
def test_auth_configuration_fails_closed_without_exposing_secrets(monkeypatch, config):
    monkeypatch.setenv("MOBILE_AGENT_ACCESS_GRANTS", config)
    with pytest.raises(RuntimeError) as error:
        load_access_grants()
    assert ALICE_TOKEN not in str(error.value)
    assert "secret" not in str(error.value)


def test_expired_credentials_and_sts_minimum_lifetime(client):
    with patch(
        "mobile_agent.middleware.auth.time.time", return_value=GRANTS[0]["expires_at"]
    ):
        response = client.post(
            "/mobile-use/api/v1/session/create",
            headers={"Authorization": f"Bearer {ALICE_TOKEN}"},
            json={"product_id": "prod-1", "pod_id": "pod-1"},
        )
        assert response.status_code == 401
    with (
        patch(
            "mobile_agent.middleware.auth.time.time",
            return_value=GRANTS[0]["expires_at"] - 30,
        ),
        patch.object(pod_manager, "get_resource") as allocate,
    ):
        response = client.post(
            "/mobile-use/api/v1/session/create",
            headers={"Authorization": f"Bearer {ALICE_TOKEN}"},
            json={"product_id": "prod-1", "pod_id": "pod-1"},
        )
        assert response.status_code == 401
        allocate.assert_not_called()


def test_preflight_succeeds_without_issuing_credentials(client):
    response = client.options(
        "/mobile-use/api/v1/session/create",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert not session_manager.thread_map


@pytest.mark.parametrize(
    "path", ["session/create", "session/reset", "agent/stream", "agent/cancel"]
)
def test_anonymous_replay_of_an_existing_thread_is_rejected(client, path):
    created = create_session(client)
    session = session_manager.thread_map[created["thread_id"]]
    with patch.object(pod_manager, "get_resource") as allocate:
        response = client.post(
            f"/mobile-use/api/v1/{path}",
            json={
                "thread_id": created["thread_id"],
                "product_id": "prod-1",
                "pod_id": "pod-1",
                "message": "hello",
            },
        )
    assert response.status_code == 401
    assert session_manager.thread_map[created["thread_id"]] == session
    allocate.assert_not_called()


def test_a_query_token_cannot_bypass_bearer_authentication(client):
    response = client.post(
        f"/mobile-use/api/v1/session/create?token={ALICE_TOKEN}",
        json={
            "product_id": "prod-1",
            "pod_id": "pod-1",
        },
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "path", ["session/create", "session/reset", "agent/stream", "agent/cancel"]
)
def test_unknown_threads_do_not_allocate_or_mutate_sessions(client, path):
    with patch.object(pod_manager, "get_resource") as allocate:
        response = client.post(
            f"/mobile-use/api/v1/{path}",
            headers={"Authorization": f"Bearer {ALICE_TOKEN}"},
            json={
                "thread_id": "nonexistent",
                "product_id": "prod-1",
                "pod_id": "pod-1",
                "message": "hello",
            },
        )
    assert response.status_code == 403
    assert not session_manager.thread_map
    allocate.assert_not_called()


def test_sts_never_outlives_the_access_grant(client):
    with patch(
        "mobile_agent.middleware.auth.time.time",
        return_value=GRANTS[0]["expires_at"] - 120,
    ):
        created = create_session(client)
        assert (
            datetime.fromisoformat(created["pod"]["token"]["ExpiredTime"]).timestamp()
            == GRANTS[0]["expires_at"]
        )
        assert created["pod"]["expired_time"] == 120


@pytest.mark.parametrize("config", ["", "invalid"])
def test_application_import_rejects_missing_or_invalid_auth_config(config):
    env = {**os.environ, "MOBILE_AGENT_ACCESS_GRANTS": config}
    process = subprocess.run(
        [sys.executable, "-c", "import app"],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert process.returncode != 0
    assert "MOBILE_AGENT_ACCESS_GRANTS must contain" in process.stderr
    assert ALICE_TOKEN not in process.stderr
