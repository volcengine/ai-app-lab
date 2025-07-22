import logging
import re

from browser_use.browser import BrowserSession
from browser_use.controller.views import SearchGoogleAction
from browser_use.agent.views import ActionResult
from browser_use.controller.service import Controller
from bs4 import BeautifulSoup
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import PromptTemplate
import markdownify
from playwright.async_api import Page
from pydantic import BaseModel

from my_browser_use.i18n import _

logger = logging.getLogger(__name__)


class MyController(Controller):
    """Custom controller extending base Controller with additional actions.
    
    Features:
    - Inherits core controller functionality
    - Adds custom pause action handler
    - Maintains action registry with exclusion support
    """

    def __init__(
        self,
        exclude_actions: list[str] = [],
        output_model: type[BaseModel] | None = None,
    ):
        super().__init__(exclude_actions, output_model)

        # Basic Navigation Actions
        @self.registry.action(
            _('Search the query in Baidu in the current tab, the query should be a search query like humans search in Baidu, concrete and not vague or super long. More the single most important items.'),
            param_model=SearchGoogleAction,
        )
        async def search_google(params: SearchGoogleAction, browser_session: BrowserSession):
            search_url = f'https://www.baidu.com/s?wd={params.query}'
            
            page = await browser_session.get_current_page()
            await page.goto(search_url)
            await page.wait_for_load_state()
            msg = _('🔍 Searched for "{query}" in Baidu').format(query=params.query)
            logger.info(msg)
            return ActionResult(extracted_content=msg, include_in_memory=True)
