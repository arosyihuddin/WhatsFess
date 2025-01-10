# Gunakan image Node.js resmi sebagai base image
FROM node:16

# Tentukan direktori kerja di dalam container
WORKDIR /usr/src/app

# Salin package.json dan package-lock.json terlebih dahulu
COPY package*.json ./

# Instal dependensi aplikasi
RUN npm install

# Instal TypeScript secara global untuk keperluan build
RUN npm install -g typescript

# Salin semua file aplikasi ke dalam container
COPY . .

# Jalankan perintah build TypeScript untuk mengkompilasi aplikasi
RUN npm run build

# Expose port aplikasi (misalnya port 3000)
EXPOSE 3000

# Jalankan aplikasi di mode produksi dengan node.js
CMD ["npm", "start"]
