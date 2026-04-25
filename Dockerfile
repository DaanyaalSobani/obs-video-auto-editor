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

# Install auto-editor globally via pipx and pre-download its binary
ENV PATH="/root/.local/bin:${PATH}"
RUN pipx install auto-editor
RUN ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 /tmp/dummy.mp4 && \
    auto-editor /tmp/dummy.mp4 -o /tmp/dummy_out.mp4 && \
    rm -f /tmp/dummy.mp4 /tmp/dummy_out.mp4

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
