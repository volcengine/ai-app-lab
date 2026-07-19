import functools
import json
import logging

import lark_oapi as lark
from lark_oapi.api.bitable.v1 import *
from lark_oapi.api.docx.v1 import *
from lark_oapi.api.drive.v1 import *
from lark_oapi.api.im.v1 import *
from lark_oapi.api.wiki.v2 import *
from lark_oapi.core.token import *

from mcp_server_lark.config import Contact

logger = logging.getLogger(__name__)

T = TypeVar("T")


def lark_api_call(method: Callable[..., T]) -> Callable[..., Optional[T]]:
    """
    wraps a method returning a Lark API response.
      - Catch exceptions,
      - Check if the response is successful,
      - Log errors when needed,
      - Return the successful response or None on failure.
    """

    @functools.wraps(method)
    def wrapper(*args, **kwargs) -> Optional[T]:
        self = args[0]
        logger = getattr(self, "_logger", logging.getLogger(__name__))

        try:
            response: T = method(*args, **kwargs)
        except Exception as e:
            logger.error("Lark SDK Exception: %s", str(e))
            return None

        # Response should have .success(), .code, .msg
        if hasattr(response, "success") and not response.success():
            code = getattr(response, "code", "UnknownCode")
            msg = getattr(response, "msg", "UnknownMessage")
            log_id = getattr(response, "get_log_id", lambda: "UnknownLogID")()
            raw_content = getattr(response, "raw", None)
            raw_response_str = ""
            if raw_content and hasattr(raw_content, "content"):
                try:
                    raw_response_str = json.dumps(
                        json.loads(raw_content.content), indent=4, ensure_ascii=False
                    )
                except Exception:
                    # In case the raw content is not JSON
                    raw_response_str = str(raw_content.content)

            logger.error(
                "Lark API call failed. code: %s, msg: %s, log_id: %s\nResponse:\n%s",
                code,
                msg,
                log_id,
                raw_response_str,
            )
            return None
        return response

    return wrapper


class LarkClient:
    def __init__(
        self,
        lark_app_id: str,
        lark_secret_key: str,
        contact_list: List[Contact],
        log_level: lark.LogLevel = lark.LogLevel.DEBUG,
    ):
        self._client = (
            lark.Client.builder()
            .enable_set_token(True)
            .log_level(log_level)
            .app_id(lark_app_id)
            .app_secret(lark_secret_key)
            .build()
        )

        token_manager_config = Config()
        token_manager_config.app_id = lark_app_id
        token_manager_config.app_secret = lark_secret_key

        self._tenant_token = TokenManager().get_self_tenant_token(token_manager_config)
        self.contact_dict = (
            {contact.name: contact for contact in contact_list} if contact_list else {}
        )

        # TODO change to tenant_access_token builder method when deploying
        self._option = (
            RequestOption.builder().tenant_access_token(self._tenant_token).build()
        )

        self._logger = logging.getLogger(__name__)
        self._logger.setLevel(logging.INFO)

    @lark_api_call
    def create_folder(self, folder_token: str, folder_name: str) -> T:
        request = (
            CreateFolderFileRequest.builder()
            .request_body(
                CreateFolderFileRequestBody.builder()
                .name(folder_name)
                .folder_token(folder_token)
                .build()
            )
            .build()
        )

        return self._client.drive.v1.file.create_folder(request)

    @lark_api_call
    def create_doc(self, document_name: str, folder_token: str):
        request = (
            CreateDocumentRequest.builder()
            .request_body(
                CreateDocumentRequestBody.builder()
                .folder_token(folder_token)
                .title(document_name)
                .build()
            )
            .build()
        )

        return self._client.docx.v1.document.create(request, self._option)

    @lark_api_call
    def move_doc_to_wiki(
        self, space_id: str, parent_wiki_token: str, document_token: str
    ):
        request = (
            MoveDocsToWikiSpaceNodeRequest.builder()
            .request_body(
                MoveDocsToWikiSpaceNodeRequestBody.builder()
                .obj_type("docx")
                .parent_wiki_token(parent_wiki_token)
                .obj_token(document_token)
                .build()
            )
            .space_id(space_id)
            .build()
        )

        return self._client.wiki.v2.space_node.move_docs_to_wiki(request)

    @lark_api_call
    def write_doc_text(
        self, document_id: str, body: str
    ) -> CreateDocumentBlockChildrenResponse:
        from lark_oapi.api.docx.v1.model.text import Text
        from lark_oapi.api.docx.v1.model.text_style import TextStyle
        from lark_oapi.api.docx.v1.model.text_element import TextElement
        from lark_oapi.api.docx.v1.model.text_run import TextRun
        from lark_oapi.api.docx.v1.model.block import Block

        # build body
        body_text_run = (
            TextRun.builder()
            .content(body)
            .text_element_style(TextElementStyle.builder().build())
            .build()
        )

        body_text_element = TextElement.builder().text_run(body_text_run).build()

        # build text block of header and body
        text_block = (
            Text.builder()
            .style(TextStyle.builder().build())
            .elements([body_text_element])
            .build()
        )

        # wrap text block in a document block
        document_block = Block.builder().block_type(2).text(text_block).build()

        # build request body
        request_body = (
            CreateDocumentBlockChildrenRequestBody.builder()
            .children([document_block])
            .index(0)
            .build()
        )

        # build full request
        request = (
            CreateDocumentBlockChildrenRequest.builder()
            .document_id(document_id)
            .block_id(document_id)
            .document_revision_id(-1)
            .request_body(request_body)
            .build()
        )

        return self._client.docx.v1.document_block_children.create(
            request, self._option
        )

    @lark_api_call
    def send_message(self, message: str, contact_name: str) -> CreateMessageResponse:
        contact_info = self.contact_dict.get(contact_name, None)
        if contact_info is None:
            return "Contact is not found"

        message = {"text": message}
        request: CreateMessageRequest = (
            CreateMessageRequest.builder()
            .receive_id_type(contact_info.id_type.value)
            .request_body(
                CreateMessageRequestBody.builder()
                .receive_id(contact_info.id)
                .msg_type("text")
                .content(json.dumps(message))
                .build()
            )
            .build()
        )
        return self._client.im.v1.message.create(request, self._option)
