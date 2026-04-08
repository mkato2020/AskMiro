FROM python:3.11-slim

# Install Node.js 20 LTS for React/Vite build
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Build React UI (outputs to frontend/dist/)
RUN cd react_ui && npm install && npm run build && echo "React build OK"

EXPOSE 8080
CMD uvicorn api:app --host 0.0.0.0 --port 8080
