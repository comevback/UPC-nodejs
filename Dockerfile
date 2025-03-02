# 第一个阶段：使用 Go 官方镜像构建 Go 可执行文件
FROM golang:1.22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制go.mod和go.sum文件并下载依赖
COPY backend/UPC-GO/go.mod backend/UPC-GO/go.sum ./
RUN go mod download

# 复制其余源代码
COPY backend/UPC-GO/ ./

# 编译Go应用为静态可执行文件
RUN go build -o upc-go .

# 第二个阶段：构建前端应用
FROM node:20-alpine AS nodebuilder

# 设置工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json (如果有)
COPY frontend/upc-react/package*.json ./

# 安装项目依赖
RUN npm install --production

# 复制前端代码
COPY frontend/upc-react/ ./frontend/upc-react/

# 构建前端应用
RUN npm run build --prefix ./frontend/upc-react

# 第三个阶段：使用最小化的基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /usr/src/app

# 安装必要的包、oh-my-zsh、zsh-autosuggestions 和 pack，并清理缓存
RUN apk update && apk add --no-cache \
    curl \
    git \
    zsh \
    python3 \
    make \
    g++ \
    zip && \
    npm install -g concurrently serve && \
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" && \
    git clone https://github.com/zsh-users/zsh-autosuggestions ~/.zsh/zsh-autosuggestions && \
    echo "source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh" >> ~/.zshrc && \
    (curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.32.1/pack-v0.32.1-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack) && \
    apk del git python3 make g++ && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/* /usr/share/man /usr/share/doc /usr/share/licenses

# 复制前端构建输出
COPY --from=nodebuilder /usr/src/app/frontend/upc-react/build ./frontend/upc-react/build

# 复制后端和注册服务器文件
COPY . .

# 安装后端和注册服务器的项目依赖
RUN npm install --prefix ./register-server --production

# 从构建阶段复制 Go 可执行文件
COPY --from=builder /app/upc-go ./backend/UPC-GO/upc-go

# 启动 frp 客户端
RUN chmod +x /usr/src/app/backend/UPC-Node/frpc

# 暴露端口
EXPOSE 3000 4000 8000


# 定义容器启动时运行的命令
CMD ["npm", "start"]
