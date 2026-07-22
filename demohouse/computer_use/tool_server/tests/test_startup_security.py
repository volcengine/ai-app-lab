import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from main import validate_security_settings


class StartupSecurityTests(unittest.TestCase):
    def test_rejects_empty_auth_key(self):
        with self.assertRaisesRegex(RuntimeError, "auth_key"):
            validate_security_settings(SimpleNamespace(auth_key=""))

    def test_accepts_configured_auth_key(self):
        validate_security_settings(SimpleNamespace(auth_key="configured-secret"))


if __name__ == "__main__":
    unittest.main()
