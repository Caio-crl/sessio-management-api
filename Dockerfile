FROM node:alpine as dependencies

WORKDIR /app/dependencies

# Copiar os arquivos de dependências
ADD package.json package-lock.json ./
RUN npm i --verbose

FROM node:alpine as build

ENV NODE_MODULE_PATH=/app/dependencies
ENV NODE_PATH=$NODE_MODULE_PATH/node_modules
RUN npm config set prefix $NODE_MODULE_PATH && mkdir -p /app/dependencies

WORKDIR /app/source

# Copiar o restante dos arquivos do projeto
COPY --from=dependencies /app/dependencies /app/
COPY . .

RUN npm run build 
CMD npm start 
