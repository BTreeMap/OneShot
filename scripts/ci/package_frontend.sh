#!/bin/bash
set -euo pipefail

echo "==> Building Frontend..."
cd web
npm ci
npm run build

echo "==> Packaging into frontend.tar.xz..."
cd dist
# Create the tarball in the root of the repository
tar -cJf ../../frontend.tar.xz .
echo "==> Success! frontend.tar.xz created."
