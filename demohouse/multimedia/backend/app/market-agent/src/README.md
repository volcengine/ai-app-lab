# 营销策划 Agent

用来生成视频脚本。
## 输入输出定义

### 输入

图文输入

```python
class InputMessage(BaseModel):
    text: str
    image: str # image url or base64 
```

文本输入

```python
class InputMessage(BaseModel):
    text: str
```

### 输出

```python
class ProductInfo(BaseModel):
    name: str
    selling_point: str
    resources: list  # 素材图片url
    
class OutputMessage(BaseModel):
    video_type: str
    product_info: ProductInfo
    video_advice: str
```

## 工具

1. [联网搜索 MCP](https://www.volcengine.com/docs/82379/1338552)
