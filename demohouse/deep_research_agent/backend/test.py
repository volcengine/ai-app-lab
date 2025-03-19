from arkitect.core.component.tool.builder import build_mcp_clients_from_config


async def main():
    clients = build_mcp_clients_from_config(
        "/Users/bytedance/Documents/deepresearch/ai-app-lab/demohouse/deep_research_agent/backend/mcp_config.json"
    )

    for client in clients:
        await client.connect_to_server()

    for client in clients:
        print(await client.list_tools())

    # for client in clients:
    #     await client.cleanup()


if __name__ == "__main__":
    import asyncio

    asyncio.get_event_loop().run_until_complete(main())
