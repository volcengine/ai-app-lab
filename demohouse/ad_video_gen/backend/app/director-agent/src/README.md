# 视频导演 Agent

电商营销视频导演，生成富有创意的电商营销视频分镜脚本。

## 输入输出定义

### 输入

视频脚本配置（进行分镜脚本制作）

```python
class ProductInfo(BaseModel):
    name: str
    selling_point: str
    resources: list  # 素材图片url

class InputMessage(BaseModel):
    video_type: str
    product_info: ProductInfo
    video_advice: str
```

分镜图片列表（评估后，进行分镜视频制作）

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

### 输出

分镜图片列表

```python
class ImageItem(BaseModel):
    id: int      # 每个分镜内图片的id
    url: str     # 图片的 tos url
    
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
    
class Video(BaseModel):
    shot_id: str # 分镜id
    prompt: str
    action: str  # 分镜的口播文案，无则为空
    videos: VideoItem
    
class OutputMessage(BaseModel):
    video_list: list(Video)
```

## 工具

1. 图片生成：VeADK 内置 `image_generate` 工具
2视频生成：VeADK 内置 `video_generate` 工具
