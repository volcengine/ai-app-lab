# 合成发布 Agent

用来将生成的分镜视频合成，并且发布至指定平台。

## 输入输出定义

### 输入

分镜视频列表

### 输出

```python
class VideoInfo(BaseModel):
    video_type: str
    video_title: str
    video_release: str
    
class OutputMessage(BaseModel):
    video_url: str
    content: VideoInfo
```

## 工具

1. [视频合成工具 Moviepy](https://moviepy-cn.readthedocs.io/zh/latest/)
2. [视频云合成工具 vod-mcp-server](https://github.com/volcengine/mcp-server.git#subdirectory=server/mcp_server_vod)

注：视频合成工具默认采用第一种方式，第二种方式需要自行配置火山视频云相关信息