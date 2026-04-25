FROM ubuntu:24.04

# Avoid tzdata interactive prompt
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, Python, FFmpeg, and pipx
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    pipx \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install auto-editor globally via pipx
ENV PATH="/root/.local/bin:${PATH}"
RUN pipx install auto-editor

# Set up the app directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy application files
COPY server.js ./
COPY public ./public

# Ensure uploads directory exists
RUN mkdir -p uploads

# Expose the server port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
