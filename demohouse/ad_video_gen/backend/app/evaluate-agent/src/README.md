# 评估 Agent

用来评测分镜图片与视频。

## 输入输出定义

### 输入

分镜图片列表

```python
class ImageItem(BaseModel):
    id: int      # 每个分镜内图片的id
    url: str     # 图片的 tos url
    
class Image(BaseModel):
    shot_id: str # 分镜id
    prompt: str
    action: str  # 分镜的口播文案，无则为空
    image: ImageItem
    
class InputMessage(BaseModel):
    image_list: list(Image)
```

分镜视频列表

```python
class VideoItem(BaseModel):
    id: int      # 每个分镜内视频的id
    url: str     # 视频的 tos url
    
class Video(BaseModel):
    shot_id: str # 分镜id
    prompt: str
    action: str  # 分镜的口播文案，无则为空
    videos: list(VideoItem)
    
class InputMessage(BaseModel):
    video_list: list(Video)
```

### 输出

分镜图片列表

```python
class ImageItem(BaseModel):
    id: int      # 每个分镜内图片的id
    url: str     # 图片的 tos url
    score: int   # Byteval给出的分数
    
class Image(BaseModel):
    shot_id: str # 分镜id
    prompt: str
    action: str  # 分镜的口播文案，无则为空
    images: list(ImageItem)
    
class OutputMessage(BaseModel):
    image_list: list(Image)
```

分镜视频列表

```python
class VideoItem(BaseModel):
    id: int      # 每个分镜内视频的id
    url: str     # 视频的 tos url
    score: int   # Byteval给出的分数
    
class Video(BaseModel):
    shot_id: str # 分镜id
    prompt: str
    action: str  # 分镜的口播文案，无则为空
    videos: list(VideoItem)
    
class OutputMessage(BaseModel):
    video_list: list(Video)
```

## 工具

使用doubao模型进行评估
