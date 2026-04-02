FROM python:3.11-slim

# Install Node.js for React build
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Build React UI (outputs to frontend/dist/)
RUN cd react_ui && npm install && npm run build

EXPOSE 8080
CMD uvicorn api:app --host 0.0.0.0 --port 8080
