# Speech Model Context Protocol Server

An MCP server implementation for speech of volcengine

## Features

### Tools

- **asr**
    Automatic Speech Recognition: Converts audio to text.
  - Args:
    - content: url or absolute path of the audio file to transcribe.
  - Returns:
    - Asr text
- **tts**
    Text-to-Speech: Synthesizes text into audio.
  - Args:
    - text: The text to synthesize into speech.
    - speed: Speech speed (e.g., 1.0 for normal). default: 1.0.
    - encoding: Desired audio output format (e.g., 'mp3', 'wav'). default: 'mp3'.
  - Returns:
    - Return the path of audio file.

## Configuration

The server requires the following environment variables to be set:

- `VOLC_APPID`: Required, The APP ID for the VolcEngine.
- `VOLC_TOKEN`: Required, The Access Token for the VolcEngine.
- `VOLC_VOICE_TYPE`: Optional, Large speech synthesis model service voice_type, default is 'zh_female_meilinvyou_moon_bigtts'
- `VOLC_CLUSTER`: Required, Large speech synthesis model service cluster ID

The services that need to be activated on Volcengine are: [Large speech synthesis model](https://console.volcengine.com/speech/service/10007)、[Streaming speech recognition large model](<<https://console.volcengine.com/speech/service/10011)、[Large> model for audio file recognition>](<https://console.volcengine.com/speech/service/10012>)

You can set these environment variables in your shell.

### MCP Settings Configuration

To add this server to your MCP configuration, add the following to your MCP settings file:

```json
{
  "mcpServers": {
    "speech-mcp-server": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/PARENT/FOLDER/src/mcp_server_speech",
        "run",
        "main.py"
      ]
    }
  }
}
```

or

```json
{
    "mcpServers": {
        "speech-mcp-server": {
            "command": "uvx",
            "args": [
                "--from",
                "git+https://github.com/volcengine/ai-app-lab#subdirectory=mcp/server/mcp_server_speech",
                "mcp-server-speech"
            ],
            "env": {
                "VOLC_APPID": "your appid",
                "VOLC_TOKEN": "your token",
                "VOLC_VOICE_TYPE": "tts voice type",
                "VOLC_CLUSTER": "tts cluster id",
            }
        }
    }
}
```

## Usage

### Running the Server

```bash
# Run the server with stdio transport (default)
python -m mcp_server_speech [--transport/-t {sse,stdio}]
```

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
