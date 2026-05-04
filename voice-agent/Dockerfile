FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App files
COPY . .

# Create log dir
RUN mkdir -p /var/log

EXPOSE 8080

CMD ["supervisord", "-c", "supervisord.conf"]
