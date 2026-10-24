#!/usr/bin/env bash
set -e

echo "=========================================="
echo " Starting DevMemory..."
echo "=========================================="

# Check for .env file
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo "-> Creating .env from .env.example..."
  cp .env.example .env
fi

# Install dependencies if not installed
if [ ! -d "node_modules" ]; then
  echo "-> Installing root dependencies..."
  npm install
fi

if [ ! -d "client/node_modules" ]; then
  echo "-> Installing client dependencies..."
  npm --prefix client install
fi

# Build client if missing
if [ ! -d "client/dist" ]; then
  echo "-> Building client frontend..."
  npm run build
fi

echo "-> Starting server on http://localhost:4000..."
npm start
