# Tool Server SDK

A Python SDK for Tool Server that allows seamless control of computer desktop environments from your applications.

## Installation

```bash
# Install using pip
pip install tool-server-client
```

## Usage

### Basic Usage

```python
from tool_server_client.client import new_computer_use_client

# Initialize the client
client = new_computer_use_client("http://localhost:8102")

# Get screen size
width, height = client.get_screen_size()
print(f"Screen size: {width}x{height}")

# Move mouse to screen center
client.move_mouse(width // 2, height // 2)

# Click mouse
client.click_mouse(width // 2, height // 2)

# Type text
client.type_text("Hello, World!")

# Press Enter key
client.press_key("enter")
```

### Features

The SDK provides the following operations:

#### Mouse Operations

- `move_mouse(x, y)`: Move mouse to specified coordinates
- `click_mouse(x, y, button="left", press=False, release=False)`: Click mouse at specified position
- `press_mouse(x, y, button="left")`: Press mouse button at specified position
- `release_mouse(x, y, button="left")`: Release mouse button at specified position
- `drag_mouse(source_x, source_y, target_x, target_y)`: Drag from source position to target position
- `scroll(x, y, scroll_direction="up", scroll_amount=1)`: Scroll mouse wheel at specified position

#### Keyboard Operations

- `press_key(key)`: Press specified key
- `type_text(text)`: Type specified text

#### Screen Operations

- `take_screenshot()`: Take a screenshot
- `get_cursor_position()`: Get current cursor position
- `get_screen_size()`: Get screen size

#### System Operations

- `wait(duration)`: Wait for specified duration (milliseconds)
- `change_password(username, new_password)`: Change user password

## Examples

For more usage examples, see [examples.py](src/tool_server_client/examples.py).

## Advanced Usage

### Custom API Version

```python
from tool_server_client.client import ComputerUseClient

client = ComputerUseClient(base_url="http://your-server.com", api_version="2020-04-01")
```

### Handling Responses

API calls return a dictionary containing operation results that can be checked for success:

```python
response = client.move_mouse(100, 100)
if response.success:
    print("Mouse moved successfully")
else:
    print(f"Error: {response.error}")
```

## Error Handling

The SDK handles HTTP errors and raises exceptions when API calls fail:

```python
try:
    client.move_mouse(100, 100)
except Exception as e:
    print(f"Operation failed: {e}")
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
