

from arkitect.core.component.llm.model import ArkMessage


def pretty_print_message(message: ArkMessage):
    formatted_message = f"{message.role}:\n{message.content}"
    if message.tool_calls and len(message.tool_calls) > 0:
        formatted_message += "\nTool Calls:\n"
        for tool_call in message.tool_calls:
            formatted_message += f"{tool_call.function.name}: {tool_call.function.arguments}\n\n"
    
    print(formatted_message + "\n" + "-" * 50 + "\n")