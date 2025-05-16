# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import io
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd
from data.rag import save_faq
from tos.exceptions import TosServerError


class TestSaveFAQ(unittest.TestCase):
    def setUp(self):
        # Mock TOS client
        self.mock_tos = MagicMock()
        self.mock_get_object = MagicMock()
        self.mock_tos.get_object = self.mock_get_object
        self.mock_tos.put_object = MagicMock()

        # Mock Viking service
        self.mock_collection = MagicMock()
        self.mock_collection.add_doc = MagicMock()
        self.mock_viking_service = MagicMock()
        self.mock_viking_service.get_collection.return_value = self.mock_collection

        # Apply patches
        self.tos_patcher = patch("data.rag.tos_client", self.mock_tos)
        self.viking_patcher = patch(
            "data.rag.viking_knowledgebase_service", self.mock_viking_service
        )
        self.tos_patcher.start()
        self.viking_patcher.start()

    def tearDown(self):
        self.tos_patcher.stop()
        self.viking_patcher.stop()

    def test_save_faq_new_file(self):
        # Setup scenario where no existing file
        self.mock_get_object.side_effect = TosServerError(
            msg="", host_id="", resource="", resp=MagicMock(), code="NoSuchKey"
        )
        self.mock_get_object.side_effect.status_code = 404
        test_data = {"question": "new_q", "answer": "new_a", "score": 1}

        # Execute
        save_faq(pd.DataFrame([test_data]), "faqs.xlsx")

        # Verify TOS operations
        self.mock_tos.put_object.assert_called_once()
        put_args = self.mock_tos.put_object.call_args[1]

        # Check uploaded Excel content
        uploaded_bytes = put_args["Body"].read()
        df = pd.read_excel(io.BytesIO(uploaded_bytes))
        self.assertEqual(
            df.to_dict(),
            {"question": {0: "new_q"}, "answer": {0: "new_a"}, "score": {0: 1}},
        )

        # Verify knowledge base update
        self.mock_collection.add_doc.assert_called_once_with(
            add_type="tos",
            doc_id="faqs.xlsx",
            tos_path="customer-support-faqs/faqs.xlsx",
        )

    def test_save_faq_existing_file(self):
        # Setup existing file scenario
        existing_data = pd.DataFrame(
            {"question": ["existing_q"], "answer": ["existing_a"], "score": [1]}
        )
        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer) as writer:
            existing_data.to_excel(writer, index=False)
        excel_buffer.seek(0)

        self.mock_get_object.return_value = MagicMock(
            read=lambda: excel_buffer.getvalue()
        )

        test_data = {"question": "new_q", "answer": "new_a", "score": 2}

        # Execute
        save_faq(pd.DataFrame([test_data]), "faqs.xlsx")

        # Verify TOS operations
        self.mock_tos.put_object.assert_called_once()
        put_args = self.mock_tos.put_object.call_args[1]

        # Check merged data
        uploaded_bytes = put_args["Body"].read()
        df = pd.read_excel(io.BytesIO(uploaded_bytes))
        self.assertEqual(
            df.to_dict(),
            {
                "answer": {0: "existing_a", 1: "new_a"},
                "question": {0: "existing_q", 1: "new_q"},
                "score": {0: 1, 1: 2},
            },
        )


if __name__ == "__main__":
    unittest.main()
