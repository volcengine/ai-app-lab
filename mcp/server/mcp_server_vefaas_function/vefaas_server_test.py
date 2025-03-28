import unittest
import os
from vefaas_server import does_function_exist


class TestVeFaaSServerIntegration(unittest.TestCase):
    def setUp(self):
        # Check if credentials are available
        self.ak = os.environ.get("ACCESS_KEY_ID")
        self.sk = os.environ.get("ACCESS_KEY_SECRET")
        if not self.ak or not self.sk:
            self.assertFalse(
                "ACCESS_KEY_ID or ACCESS_KEY_SECRET environment variables not set"
            )

    def test_does_function_exist_with_real_credentials(self):
        # Test with a known non-existent function ID
        non_existent_id = "non-existent-function-123"
        result = does_function_exist(non_existent_id, "cn-beijing")
        self.assertFalse(result)

        # Note: To test a positive case, you would need a real function ID
        # that exists in your account. You could add something like:
        # known_function_id = "your-real-function-id"
        # result = does_function_exist(known_function_id, "cn-beijing")
        # self.assertTrue(result)


if __name__ == "__main__":
    unittest.main()
