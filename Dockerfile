# Stage 1: Build
FROM node:18 AS build

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Salin hanya file yang diperlukan untuk instalasi dependensi
COPY package.json yarn.lock ./

# Instal dependensi aplikasi
RUN yarn install --frozen-lockfile

# Salin hanya file sumber yang diperlukan untuk build
COPY src/ ./src/
COPY tsconfig.json ./

# Instal TypeScript secara lokal
RUN yarn add typescript --dev

# Jalankan perintah build TypeScript untuk mengkompilasi aplikasi
RUN yarn build

# Stage 2: Production
FROM node:18-alpine

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Salin hanya file package.json dan yarn.lock
COPY package.json yarn.lock ./

# Instal dependensi runtime saja (tanpa devDependencies)
RUN yarn install --production --frozen-lockfile

# Salin hasil build dari stage build
COPY --from=build /app/dist ./dist

# Expose port aplikasi (misalnya port 3000)
EXPOSE 3000

# Jalankan aplikasi di mode produksi dengan node.js
CMD ["node", "dist/index.js"]
