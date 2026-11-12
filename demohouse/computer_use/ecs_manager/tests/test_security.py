import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

TEST_AUTH_KEY = "test-auth-key"
SENSITIVE_VALUES = {
    "access_key": "AK-TEST-SECRET",
    "secret_key": "SK-TEST-SECRET",
    "password": "PASSWORD-TEST-SECRET",
    "user_data": "#!/bin/bash\nTOKEN-TEST-SECRET",
}

# 必须在导入应用前写入，服务启动时会校验 auth_key 非空
os.environ["auth_key"] = TEST_AUTH_KEY
os.environ["mgr__access_key"] = SENSITIVE_VALUES["access_key"]
os.environ["mgr__secret_key"] = SENSITIVE_VALUES["secret_key"]
os.environ["instance_config__password"] = SENSITIVE_VALUES["password"]
os.environ["instance_config__user_data"] = SENSITIVE_VALUES["user_data"]

from fastapi.testclient import TestClient  # noqa: E402

from main import app, validate_security_settings  # noqa: E402


class StartupSecurityTests(unittest.TestCase):
    def test_rejects_empty_auth_key(self):
        with self.assertRaisesRegex(RuntimeError, "auth_key"):
            validate_security_settings(SimpleNamespace(auth_key=""))

    def test_accepts_configured_auth_key(self):
        validate_security_settings(SimpleNamespace(auth_key="configured-secret"))


class AuthMiddlewareTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_rejects_request_without_credentials(self):
        response = self.client.get("/config")
        self.assertEqual(response.status_code, 401)

    def test_rejects_invalid_key(self):
        response = self.client.get("/config", headers={"Authorization": "wrong-key"})
        self.assertEqual(response.status_code, 401)

    def test_accepts_authorization_header(self):
        response = self.client.get("/config", headers={"Authorization": TEST_AUTH_KEY})
        self.assertEqual(response.status_code, 200)

    def test_accepts_x_api_key_header(self):
        response = self.client.get("/config", headers={"X-API-Key": TEST_AUTH_KEY})
        self.assertEqual(response.status_code, 200)


class ConfigEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_config_does_not_leak_credentials(self):
        response = self.client.get(
            "/config", headers={"Authorization": TEST_AUTH_KEY}
        )
        self.assertEqual(response.status_code, 200)
        body = response.text
        for field, value in SENSITIVE_VALUES.items():
            self.assertNotIn(value, body, f"/config 泄露了敏感字段 {field}")
        config = response.json()["config"]
        self.assertNotIn("access_key", config["mgr"])
        self.assertNotIn("secret_key", config["mgr"])
        self.assertNotIn("session_token", config["mgr"])
        self.assertNotIn("password", config["instance_config"])
        self.assertNotIn("user_data", config["instance_config"])

    def test_config_keeps_non_sensitive_fields(self):
        response = self.client.get(
            "/config", headers={"Authorization": TEST_AUTH_KEY}
        )
        config = response.json()["config"]
        self.assertEqual(config["mgr"]["region"], "cn-beijing")
        self.assertIn("instance_name", config["instance_config"])


if __name__ == "__main__":
    unittest.main()
