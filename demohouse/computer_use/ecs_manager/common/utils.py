import re

def camel_to_snake(name: str) -> str:
    name = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)

    name = re.sub(r'([a-z\d])([A-Z])', r'\1_\2', name)

    return name.lower()


def snake_to_camel(s: str) -> str:
    return s[0].upper() + s.title().replace('_', '')[1:] if s else ""
