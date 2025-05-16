FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1               \
    PYTHONDONTWRITEBYTECODE=1        \
    PIP_NO_CACHE_DIR=1               \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY README.md pyproject.toml ./
COPY src ./src/

RUN pip install . 

RUN mkdir -p /var/log/computer-use

EXPOSE 8000

CMD ["python", "-m", "mcp_server.main"]
