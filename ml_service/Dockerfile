FROM python:3.10-slim

WORKDIR /app

# Upgrade pip to ensure we get the latest wheels
RUN pip install --upgrade pip

COPY requirements.txt .
# Install dependencies (wheels should be available for x86_64 linux)
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
