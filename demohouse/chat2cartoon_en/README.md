# Chat2Cartoon_en: Interactive Bilingual Video Generator

## Application Introduction
This is an innovative tool designed for content creation. It can quickly generate meaningful bilingual videos based on a theme provided by the user. Users can also influence the final video by modifying prompts or selecting specific images/videos. It aims to provide users with a rich, colorful, and educational audio-visual experience, allowing for learning and growth through entertainment.

### Preview
[Video Preview](https://console.byteplus.com/ark/region:ark+ap-southeast-1/application)

### Live Demo
[Exprience on Console](https://console.byteplus.com/ark/region:ark+ap-southeast-1/application)

### Advantages
Convenient and Efficient Long Video Generation: Features one-click generation for minute-long videos. The process is extremely simple; users only need to input their requirements to quickly obtain a long-form video, significantly boosting creation efficiency.

High-Quality Video Output: Utilizes the latest Seedance large models to ensure high-quality video output. The visuals are clear and smooth, the story is engaging, and the profound content is paired with excellent production, satisfying user demands for both visual enjoyment and substantive depth.

Innovative Empowerment for Education: Deeply integrates into the education sector by leveraging advanced large models, perfectly blending bilingual education with animation.

### Related Models
- ByteDance-Seed-1.6: Generates a story outline, storyboard script, and provides creative prompts for character design, first frame images, video, and audio based on the user's theme.

- ByteDance-Seedream-3.0: Creates specific story characters and storyboard scenes based on descriptive prompts.

- Doubao-Speech-Synthesis: Generates voice-over files based on storyboard lines and creative prompts that match character traits and desired timbre.

- ByteDance-Seedance-1.0-lite: Generates animated video clips for the storyboard based on the first frame image and creative prompts.

### Architecture
![dependencies.jpeg](./assets/dependencies.jpeg)
The backend service can be run locally or deployed to Volcengine Function Service.

## Environment Setup
- Python version >= 3.8 and <= 3.9(Other versions may be not compatible with the MoviePy package)
- Poetry version 1.6.1 [See Docs](https://python-poetry.org/docs/#installing-with-the-official-installer)
- Node version >= 16.2.0
- Obtain APP ID and Access Token for speech technology products (see Appendix)
- Volcengine Ark API KEY See Docs
- Volcengine AK/SK See Docs
- Volcengine TOS Bucket See Docs
- Configure CORS for the Volcengine TOS Bucket See Docs
- Volcengine Ark endpoints for text generation, vision understanding, and video generation models See Docs

## Quick Start
This guide explains how to quickly deploy the Chat2Cartoon_en project locally.

1. Clone the repository

   ```bash
   git clone https://github.com/volcengine/ai-app-lab.git
   cd demohouse/chat2cartoon_en
   ```
2. Modify the backend/.env file and fill in the values for each configuration variable.
3. Install Python dependencies for the project.
   ```bash
   cd demohouse/chat2cartoon_en/backend

   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt

   ```
4. Start the backend service.
   ```bash
   python index.py
   ```
5. Start the frontend service.
   ```bash
   cd demohouse/chat2cartoon/frontend
   npm install -g pnpm@8
   pnpm install
   cp ../.env ./
   pnpm dev
   ```
6. Configure CORS for your TOS bucket to allow the local browser to access media resources on the TOS bucket.
7. Visit http://localhost:8080 to experience the application.

## Directory Structure
```
├── README.md
├── .env                  # Environment variables (API Key, AK/SK, Resource IDs, etc.)
├── index.py              # Entry script
├── app
│   ├── __init__.py
│   ├── clients
│   │   ├── __init__.py
│   │   ├── downloader.py       # Downloads video content from links returned by the video generation API
│   │   ├── llm.py              # Accesses the large language model
│   │   ├── t2i.py              # Accesses the text-to-image API
│   │   ├── tos.py              # Accesses TOS to upload video and audio files
│   │   └── vlm.py              # Accesses the VLM large model
│   ├── generators
│   │   ├── phases          # Generation logic for each backend state
│   │   ├── __init__.py
│   │   ├── phase.py        # Determines the sequence of states and parses requests for each state
│   │   ├── factory.py
│   │   └── base.py
│   ├── models                  # Pydantic data structures
│   ├── constants.py            # Constants and parsing of environment variables from the .env file
│   ├── message_utils.py
│   ├── mode.py
│   └── output_parsers.py
├── media 						# Media files
│   └── DouyinSansBold.otf      # Font for subtitles
├── requirements.txt    # Project dependency management

```

## Technical Implementation
### State Machine Flow
The interaction between the frontend and backend is based on a series of HTTP requests to /api/v3/bots/chat/completions with SSE streaming responses. To manage the overall video generation process, the frontend stores the session history and the current process phase in the browser's local storage.

### Message Structure
The request sent from the frontend to the backend resembles a typical LLM chat request, where each request includes the entire conversation history, and the last message contains the current request's content.
In a normal scenario without regenerating media assets, the backend parses the current process state from the conversation history, determines the next state/step, and executes the corresponding generation logic.
The frontend needs to include the necessary information for the next generation step in the content of each new message. The information required for each step is as follows:
| Phase                 | Frontend Step | Required Information（message.content） | Component Dependency |
|:----------------------|------|:---------------|--------|
| Script                | Create Script | Story theme | Large Language Model |
| StoryBoard            | Create Storyboard | Story script | Large Language Model |
| RoleDescription       | Describe Roles | Story script and storyboard | Large Language Model |
| RoleImage             | Generate Role Image | Role descriptions | Text-to-Image Model |
| FirstFrameDescription | Describe First Frame | Story script, storyboard, and role descriptions | Large Language Model |
| FirstFrameImage       | Generate First Frame | First frame descriptions | Text-to-Image Model |
| VideoDescription      | Describe Video | Story script, storyboard, and role descriptions | Large Language Model |
| Video                 | Generate Video | First frame image and video descriptions | Video Generation Model |
| Tone                  | Set Tone and Dialogue | Storyboard | Large Language Model |
| Audio                 | Generate Audio | Tone and dialogue | Speech Technology |
| Film                  | Create Film | Audio, dialogue, and video | FFMPEG |

#### `user` Message
The content of a user request follows the format: {Mode} {Content}
- Prefix: Mode
	- CONFIRMATION: Confirms and proceeds to the next step.
	- REGENERATION: Requests modification of the current or a previous step.
- Content: A JSON text of the complete state, maintained by the frontend. It saves information from the current conversation, such as script info (storyboards), video info (videos), and audio info (audios). This is passed in the user message when needed for the next step. The JSON format can be referenced from the code in the app/models directory. If the mode is REGENERATION, the content needs a prefix like phase={State} to specify which phase's output to regenerate, e.g., "REGENERATION phase=RoleImage {"role_descriptions":"[N roles, role descriptions]"}"

#### `assistant` Message
The content of an assistant response follows the format: phase={State} {Content}
- Prefix: phase={State}, where State is one of the Phase enum values from the state machine above.
- Content: The content can be plain text, such as the full text returned by the language model during the Script or StoryBoard phases, or JSON text, such as the IDs of several ContentGenerationTasks returned in the Video phase, or links to several audio clips returned by the speech model in the Audio phase.

A complete request example is shown below:
```json
{
  "Messages": [
    {
      "content": "Write a story about the tortoise and the hare",
      "role": "user"
    },
    {
      "content": "phase=Script\n\n\"[Story script...]\"",
      "role": "assistant"
    },
    {
      "content": "Generate the storyboard script",
      "role": "user"
    },
    {
      "content": "phase=StoryBoard\n\"[N storyboards, characters, scenes, Chinese lines, English lines]\"",
      "role": "assistant"
    },
    {
      "content": "Start generating the video",
      "role": "user"
    },
    {
      "content": "phase=RoleDescription\n\"[N characters, character descriptions]\"",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"role_descriptions\":\"[N characters, character descriptions]\"}",
      "role": "user"
    },
    {
      "content": "phase=RoleImage\n\n{\"role_images\": [{\"index\": 0, \"images\": [\"https://example-cloud-store.com/sample-image0.jpg\"]}]}\n\n",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"script\":\"[Story script...]\",\"storyboards\":\"[N storyboards, characters, scenes, Chinese lines, English lines]\",\"role_descriptions\":\"[N characters, character descriptions]\"}",
      "role": "user"
    },
    {
      "content": "phase=FirstFrameDescription\n\"[N storyboards, characters, first frame descriptions]\"",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"first_frame_descriptions\":\"[N storyboards, characters, first frame descriptions]\"}",
      "role": "user"
    },
    {
      "content": "phase=FirstFrameImage\n\n{\"first_frame_images\": [{\"index\": 0, \"images\": [\"https://example-cloud-store.com/sample-image0.jpg\"]}]}\n\n",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"script\":\"[Story script...]\",\"storyboards\":\"[N storyboards, characters, scenes, Chinese lines, English lines]\",\"role_descriptions\":\"[N characters, character descriptions]\",\"first_frame_descriptions\":\"[N storyboards, characters, first frame descriptions]\"}",
      "role": "user"
    },
    {
      "content": "phase=VideoDescription\n\"[N videos, characters, descriptions]\"",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"video_descriptions\":\"[N videos, characters, descriptions]\",\"first_frame_images\": [{\"index\": 0, \"images\": [\"https://example-cloud-store.com/sample-image0.jpg\"]}]}",
      "role": "user"
    },
    {
      "content": "phase=Video\n\n{\"videos\": [{\"index\": 0, \"video_gen_task_id\": \"cgt-xxxxxxxxxxxxxx-xxxxx\", \"video_data\": null}]}\n\n",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"storyboards\":\"[N storyboards, characters, scenes, Chinese lines, English lines]\"}",
      "role": "user"
    },
    {
      "content": "phase=Tone\n\n{\"tones\": [{\"index\": 0, \"line\": \"[Chinese line]\", \"line_en\": \"[English line]\", \"tone\": \"zh_female_shaoergushi_mars_bigtts\"}]}",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"tones\": [{\"index\": 0, \"line\": \"[Chinese line]\", \"line_en\": \"[English line]\", \"tone\": \"zh_female_shaoergushi_mars_bigtts\"}]}",
      "role": "user"
    },
    {
      "content": "phase=Audio\n\n{\"audios\": [{\"index\": 0, \"url\": \"https://tos-bucket.tos.cn-beijing.volces.com/request_id/sample-audio0.mp3\", \"audio_data\": null}]}\n\n",
      "role": "assistant"
    },
    {
      "content": "CONFIRMATION {\"storyboards\":\"[N storyboards, characters, scenes, Chinese lines, English lines]\",\"videos\":[{\"index\": 0, \"video_gen_task_id\": \"cgt-xxxxxxxxxxxxxx-xxxxx\", \"video_data\": null}],\"audios\":[{\"index\": 0, \"url\": \"https://tos-bucket.tos.cn-beijing.volces.com/request_id/sample-audio0.mp3\", \"audio_data\": null}]}",
      "role": "user"
    }
  ]
}
```

## Appendix
How to get TTS_APP_ID, TTS_ACCESS_TOKEN, ASR_APP_ID, ASR_ACCESS_TOKEN?
1. [Complete enterprise verification](https://console.volcengine.com/user/authentication/detail/)
2. [Activate speech technology products](https://console.volcengine.com/speech/app)
3. [Create an application](https://console.volcengine.com/speech/app), and check the boxes for both Large Model Speech Synthesis and Streaming ASR Large Model.
4. Activate the large model for speech synthesis and ensure the page has available timbres. Note: There is a 5-10 minute delay after activation before the large model speech synthesis can be used.
5. The Streaming ASR Large Model has a trial package and can be used without full activation. For stable service, it is recommended to activate the official version.
6. Get TTS_APP_ID and TTS_ACCESS_TOKEN.
7. Get ASR_APP_ID and ASR_ACCESS_TOKEN.
