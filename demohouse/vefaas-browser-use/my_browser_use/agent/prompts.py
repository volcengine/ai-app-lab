import importlib.resources

def load_system_prompt():
    """Load the prompt template from the markdown file."""
    try:
        # This works both in development and when installed as a package
        with importlib.resources.files('my_browser_use.agent').joinpath('system_prompt.md').open('r') as f:
            return f.read() + load_extend_prompt()
    except Exception as e:
        raise RuntimeError(f'Failed to load system prompt template: {e}')

def load_extend_prompt():
    """Load the prompt template from the markdown file."""
    try:
        # This works both in development and when installed as a package
        with importlib.resources.files('my_browser_use.agent').joinpath('extend_prompt.md').open('r') as f:
            return f.read()
    except Exception as e:
        raise RuntimeError(f'Failed to load planner prompt template: {e}')