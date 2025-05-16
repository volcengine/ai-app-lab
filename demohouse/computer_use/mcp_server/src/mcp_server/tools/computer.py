from mcp import types
from pydantic import Field
from tool_server_client.models import *

from mcp_server.common.client import tool_server_client
from mcp_server.common.errors import handle_error
from mcp_server.common.logs import LOG
from mcp_server.tools import MCP


@MCP.tool(
    name="move_mouse",
    description="Move the mouse pointer to the target position"
)
async def move_mouse(
    x: int = Field(
        default=50,
        description="X coordinate of the mouse pointer to the target position"
    ),
    y: int = Field(
        default=50,
        description="Y coordinate of the mouse pointer to the target position"
    ),
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info(f"Call move mouse, x: {x}, y: {y}")
    try:
        client = tool_server_client(endpoint)
        response = client.move_mouse(
            x=x,
            y=y,
        )

        if not response:
            return handle_error("move_mouse")

        return [
            types.TextContent(
                type="text",
                text="Operation successful"
            )
        ]

    except Exception as e:
        return handle_error("move_mouse", e)


@MCP.tool(
    name="click_mouse",
    description="Click the mouse pointer at the target position"
)
async def click_mouse(
    x: int = Field(
        default=50,
        description="X coordinate of the mouse pointer to the target position"
    ),
    y: int = Field(
        default=50,
        description="Y coordinate of the mouse pointer to the target position"
    ),
    button: str = Field(
        default="",
        description="Mouse button, optional values: Left: left button, Right: right button, Middle: middle button, DoubleLeft: double-click left button"
    ),
    endpoint: str = Field(
        default=None,
    )
):
    LOG.info(f"Call click mouse, x: {x}, y: {y}, button: {button}")
    try:
        client = tool_server_client(endpoint)
        response = client.click_mouse(
            x=x,
            y=y,
            button=button,
            press=False,
            release=False,
        )
        if not response:
            return handle_error("click_mouse")

        return [
            types.TextContent(
                type="text",
                text="Operation successful"
            )
        ]

    except Exception as e:
        return handle_error("click_mouse", e)


@MCP.tool(
    name="drag_mouse",
    description="Drag the mouse pointer from the start position to the target position"
)
async def drag_mouse(
    source_x: int = Field(
        default=50,
        description="X coordinate of the mouse pointer to the start position"
    ),
    source_y: int = Field(
        default=50,
        description="Y coordinate of the mouse pointer to the start position"
    ),
    target_x: int = Field(
        default=50,
        description="X coordinate of the mouse pointer to the target position"
    ),
    target_y: int = Field(
        default=50,
        description="Y coordinate of the mouse pointer to the target position"
    ),
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info(
        f"Call drag mouse, source_x: {source_x}, source_y: {source_y}, target_x: {target_x}, target_y: {target_y}")
    try:
        client = tool_server_client(endpoint)
        response = client.drag_mouse(
            source_x=source_x,
            source_y=source_y,
            target_x=target_x,
            target_y=target_y,
        )

        if not response:
            return handle_error("drag_mouse")

        return [
            types.TextContent(
                type="text",
                text="Operation successful"
            )
        ]

    except Exception as e:
        return handle_error("drag_mouse", e)


@MCP.tool(
    name="scroll",
    description="Scroll the mouse pointer to the target position"
)
async def scroll(
    x: int = Field(
        default=50,
        description="X coordinate of the mouse pointer to the target position"
    ),
    y: int = Field(
        default=50,
        description="Y coordinate of the mouse pointer to the target position"
    ),
    direction: str = Field(
        default=None,
        description="Scroll direction, optional values: Up, Down, Left, Right"
    ),
    amount: int = Field(
        default=0,
        description="Scroll times", ge=0, le=10
    ),
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info(
        f"Call scroll, x: {x}, y: {y}, direction: {direction}, amount: {amount}")
    try:
        client = tool_server_client(endpoint)
        response = client.scroll(
            x=x,
            y=y,
            scroll_amount=amount,
            scroll_direction=direction,
        )

        if not response:
            return handle_error("scroll")

        return [
            types.TextContent(
                type="text",
                text="Operation successful"
            )
        ]

    except Exception as e:
        return handle_error("scroll", e)


@MCP.tool(
    name="press_key",
    description="Press the specified key"
)
async def press_key(
    key: str = Field(
        default=None,
        description="Specified key, if it's multiple text, please use TypeText"
    ),
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info(f"Call press key, key: {key}")
    try:
        client = tool_server_client(endpoint)
        response = client.press_key(
            key=key,
        )

        if not response:
            return handle_error("press_key")

        return [
            types.TextContent(
                type="text",
                text="Operation successful"
            )
        ]

    except Exception as e:
        return handle_error("press_key", e)


@MCP.tool(
    name="type_text",
    description="Type the specified text"
)
async def type_text(
    text: str = Field(
        default=None,
        description="Clipboard content, string length limit 100"
    ),
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info(f"Call type text, text: {text}")
    try:
        client = tool_server_client(endpoint)
        response = client.type_text(
            text=text,
        )

        if not response:
            return handle_error("type_text")

        return [
            types.TextContent(
                type="text",
                text="Operation successful"
            )
        ]

    except Exception as e:
        return handle_error("type_text", e)


@MCP.tool(
    name="get_cursor_position",
    description="Get the current cursor position"
)
async def get_cursor_position(
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info("Call get cursor position")
    try:
        client = tool_server_client(endpoint)
        response = client.get_cursor_position()

        if not response:
            return handle_error("get_cursor_position")

        LOG.info(
            f"Get cursor position, x: {response.Result.x}, y: {response.Result.y}")

        return [
            types.TextContent(
                type="text",
                text=str(
                    {
                        "x": response.Result.x,
                        "y": response.Result.y,
                    }
                )
            )
        ]

    except Exception as e:
        return handle_error("get_cursor_position", e)


@MCP.tool(
    name="screenshot",
    description="Take a screenshot of the current screen"
)
async def screenshot(
    endpoint: str = Field(
        default=None,
    ),
):
    LOG.info("Call screenshot")
    try:
        # get screenshot
        client = tool_server_client(endpoint)
        screenshot_response = client.take_screenshot()
        if not screenshot_response:
            return handle_error("screenshot")

        image = screenshot_response.Result.screenshot

        # get screen size
        screen_size_response = client.get_screen_size()
        if not screen_size_response:
            return handle_error("screenshot")

        width = screen_size_response.Result.width
        height = screen_size_response.Result.height

        LOG.info(f"Get screen size, width: {width}, height: {height}")

        return [
            types.TextContent(
                type="text",
                text=str(
                    {
                        "width": width,
                        "height": height,
                    }
                )
            ),
            types.ImageContent(
                type="image",
                data=image,
                mimeType="image/png",
            )
        ]

    except Exception as e:
        return handle_error("screenshot", e)
