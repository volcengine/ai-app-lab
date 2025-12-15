# 短链接服务 (Short Link Service)

一个基于FastAPI的轻量级短链接生成和记录服务，支持两种存储模式：内存字典模式和Redis模式。

## 功能特点

- 🔗 将长URL转换为短链接
- 🔄 支持自定义短链接类型（如 `/t/type/shortcode`）
- 📊 自动检测重复URL，避免生成重复短码
- 💾 双模式存储：内存字典（默认）或Redis
- ⚡ 高性能异步处理
- 🛡️ 简洁的API接口

## 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
```

### 运行服务（默认字典模式）

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

服务启动后，默认使用内存字典模式，无需额外配置。

## 存储模式

### 1. 字典模式（默认）

- ✅ 零配置，开箱即用
- ✅ 无需额外依赖
- ⚠️ 数据存储在内存中，服务重启后数据会丢失
- ⚠️ 不适合多实例部署

### 2. Redis模式

- ✅ 数据持久化
- ✅ 支持多实例共享数据
- ✅ 适合生产环境
- ⚠️ 需要安装和配置Redis

#### 启用Redis模式

1. 安装Redis依赖：
```bash
pip install redis
```

2. 设置环境变量：
```bash
export SHORT_LINK_MODE=redis
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=your_password  # 可选
export REDIS_DB=0  # 可选，默认0
```

3. 运行服务：
```bash
uvicorn app:app --host 0.0.0.0 --port 8005
```

## API接口

### 生成短链接

**POST** `/shorten`

请求体：
```json
{
    "url": "https://example.com/very/long/url/path",
    "type": "blog"  // 可选，用于生成 /t/type/shortcode 格式的链接
}
```

响应：
```json
{
    "short_code": "AbC123",
    "short_url": "localhost:8005/t/AbC123"
}
```

### 短链接跳转

**GET** `/t/{short_code}`

或

**GET** `/t/{type}/{short_code}`

示例：
- `localhost:8000/t/AbC123` → 返回原始长URL
- `localhost:8000/t/blog/AbC123` → 返回原始长URL

## 环境变量

| 变量名 | 说明 | 默认值 | 备注 |
|--------|------|--------|------|
| `SHORT_LINK_MODE` | 存储模式 | `dict` | 可选：`dict` 或 `redis` |
| `SHORT_LINK_DOMAIN` | 短链接域名 | `localhost:8000` | 用于生成完整的短链接 |
| `REDIS_HOST` | Redis主机 | - | Redis模式下必填 |
| `REDIS_PORT` | Redis端口 | `6379` | 可选 |
| `REDIS_PASSWORD` | Redis密码 | - | 可选 |
| `REDIS_DB` | Redis数据库 | `0` | 可选 |
| `REDIS_USERNAME` | Redis用户名 | - | 可选 |

## 短码算法

服务使用62进制编码（0-9, A-Z, a-z）将自增ID转换为短码，确保：

- 短码长度随ID增长而增长
- 无冲突，每个ID对应唯一短码
- 可读性好，避免混淆字符

## 注意事项

1. **数据持久化**：字典模式下数据只存在于内存，重启服务会清空所有短链接数据
2. **重复检测**：系统会自动检测重复URL并返回已有的短码
3. **TTL支持**：Redis模式下支持24小时TTL，字典模式暂不支持过期功能
4. **性能**：字典模式适合开发测试，Redis模式适合生产环境

## 示例代码

### Python调用示例

```python
import requests

# 生成短链接
response = requests.post("http://localhost:8005/shorten", json={
    "url": "https://example.com/very/long/url/path",
    "type": "article"
})
result = response.json()
print(f"短链接：{result['short_url']}")
```

### cURL调用示例

```bash
# 生成短链接
curl -X POST "http://localhost:8005/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "type": "blog"}'

# 访问短链接（会自动跳转）
curl -i "http://localhost:8005/t/AbC123"
```

## 部署建议

### 开发环境
- 使用默认的字典模式
- 适合快速开发和测试

### 生产环境
- 使用Redis模式确保数据持久化
- 配置域名和环境变量
- 考虑添加监控和日志
- 可以部署多个实例实现负载均衡

## 故障排查

### Redis连接失败
- 检查Redis服务是否运行
- 确认网络连接和认证配置
- 查看控制台错误信息，系统会自动回退到字典模式

### 短链接失效
- 字典模式：检查服务是否重启过
- Redis模式：检查TTL设置和Redis状态

### 端口占用
- 修改运行端口：`uvicorn app:app --port 8005`