import re
from typing import List

from app.models.first_frame_description import FirstFrameDescription
from app.models.role_description import RoleDescription
from app.models.story_board import StoryBoard
from app.models.tone import Tone
from app.models.video_description import VideoDescription


def parse_storyboards(completions: str) -> List[StoryBoard]:
    characters = re.findall(r"Characters[：:](.*)", completions)
    scenes = re.findall(r"Scene[：:](.*)", completions)
    lines = re.findall(r"Chinese Dialogue[：:](.*)", completions)
    lines_en = re.findall(r"English Dialogue[：:](.*)", completions)

    story_boards = []
    for c, s, l, le in zip(characters, scenes, lines, lines_en):
        story_boards.append(
            StoryBoard(
                characters=c.split("，") if "，" in c else [c],
                scene=s,
                lines=l,
                lines_en=le
            )
        )
    return story_boards


def parse_role_description(completions: str) -> List[RoleDescription]:
    descriptions = re.findall(r"Description[：:](.*)", completions)
    role_descriptions = [RoleDescription(description=d) for d in descriptions]
    return role_descriptions


def parse_first_frame_description(completions: str) -> List[FirstFrameDescription]:
    descriptions = re.findall(r"First Frame Description[：:](.*)", completions)
    characters = re.findall(r"Characters[：:](.*)", completions)
    first_frame_descriptions = [FirstFrameDescription(
        description=d,
        characters=c.split("，") if "，" in c else [c],
    ) for d, c in zip(descriptions, characters)]
    return first_frame_descriptions


def parse_video_description(completions: str) -> List[VideoDescription]:
    descriptions = re.findall(r"Description[：:](.*)", completions)
    characters = re.findall(r"Characters[：:](.*)", completions)
    video_descriptions = [VideoDescription(
        description=d,
        characters=c.split("，") if "，" in c else [c],
    ) for d, c in zip(descriptions, characters)]
    return video_descriptions


def parse_tone(completions: str) -> List[Tone]:
    lines = re.findall(r"Chinese Dialogue[：:](.*)", completions)
    lines_en = re.findall(r"English Dialogue[：:](.*)", completions)
    tones_text = re.findall(r"Voice[：:](.*)", completions)

    tones = []
    for i, (l, le, t) in enumerate(zip(lines, lines_en, tones_text)):
        tones.append(
            Tone(
                index=i,
                line=l,
                line_en=le,
                tone=t,
            )
        )
    return tones
