import abc
from typing import List

from arkitect.types.llm.model import ArkMessage

"""
Memory interface define
"""


class Memory(abc.ABC):

    # init memory would never be discarded
    @abc.abstractmethod
    def init_memory(self, messages: List[ArkMessage]) -> None:
        pass

    @abc.abstractmethod
    def add_memory(self, messages: List[ArkMessage], **kwargs) -> None:
        pass

    @abc.abstractmethod
    def load_memory(self, **kwargs) -> List[ArkMessage]:
        pass

    # tidy the memory (e.g. truncate)
    @abc.abstractmethod
    def tidy_memory(self, **kwargs) -> None:
        pass
