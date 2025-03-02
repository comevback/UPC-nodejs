#!/bin/bash

# get host name
os_name=$(uname -s)
white="\033[0;37m"
green="\033[1;32m"
end_style="\033[0m"

# test if sudo command exists
if command -v sudo &> /dev/null
then
    SUDO="sudo"
else
    SUDO=""
fi

# 检查 Docker 是否正在运行
if ! docker info > /dev/null 2>&1; then
    echo -e "\033[1;31mDocker is not running. Please start Docker and try again.\033[0m"
    exit 1
fi

#  get local ip address according to the operating system
if [ "$os_name" = "Linux" ]; then
    ip_address=$(hostname -I | awk '{print $1}')
elif [ "$os_name" = "Darwin" ]; then
    ip_address=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -n 1)
else
    echo "Unsupported OS"
    ip_address=localhost
fi

# get public ip address
public_ip_address=$(curl -s https://api.ipify.org)

echo -e "\033[2J\033[0;0H"
echo -e "${white}---------------------------------------------------------------------------------------${end_style}"
echo -e "${white}|                               UPC System Start Script                               |${end_style}"
echo -e "${white}|-------------------------------------------------------------------------------------|${end_style}"

echo -e "${white}|                              ██╗   ██╗██████╗  ██████╗                              |${end_style}"
echo -e "${white}|                              ██║   ██║██╔══██╗██╔════╝                              |${end_style}"
echo -e "${white}|                              ██║   ██║██████╔╝██║                                   |${end_style}"
echo -e "${white}|                              ██║   ██║██╔═══╝ ██║                                   |${end_style}"
echo -e "${white}|                              ╚██████╔╝██║     ╚██████╗                              |${end_style}"
echo -e "${white}|                               ╚═════╝ ╚═╝      ╚═════╝                              |${end_style}"

echo -e "${white}|-------------------------------------------------------------------------------------|${end_style}"
echo -e "${white}|                                   Register Server                                   |${end_style}"
echo -e "${white}---------------------------------------------------------------------------------------${end_style}"

echo ""
echo -e "\033[37mYour Host type: \033[1;33m$os_name${end_style}"
echo -e "\033[37mYour Local IP Address: \033[1;33m$ip_address${end_style}"
echo -e "\033[37mYour Public IP Address: \033[1;33m$public_ip_address${end_style}"
echo ""

echo -e "\033[1;37m1. Please enter your Register \033[1;31mPORT${end_style} ${white}(press Enter for default:${end_style} \033[32m8000${end_style}${white}):${end_style}"
read regi_PORT
REGI_PORT=${regi_PORT:-8000}
echo -e "\033[97mRegister Server URL: ${green}\033[4mhttp://$ip_address:$REGI_PORT${end_style}"


sleep 1

echo -e "\033[2J\033[0;0H"
echo -e "${green}---------------------------------------------------------------------------------------${end_style}"
echo -e "${green}|                               UPC System Start Script                               |${end_style}"
echo -e "${green}|-------------------------------------------------------------------------------------|${end_style}"

echo -e "${green}|                              ██╗   ██╗██████╗  ██████╗                              |${end_style}"
echo -e "${green}|                              ██║   ██║██╔══██╗██╔════╝                              |${end_style}"
echo -e "${green}|                              ██║   ██║██████╔╝██║                                   |${end_style}"
echo -e "${green}|                              ██║   ██║██╔═══╝ ██║                                   |${end_style}"
echo -e "${green}|                              ╚██████╔╝██║     ╚██████╗                              |${end_style}"
echo -e "${green}|                               ╚═════╝ ╚═╝      ╚═════╝                              |${end_style}"

echo -e "${green}|-------------------------------------------------------------------------------------|${end_style}"
echo -e "${green}|                                   Register Server                                   |${end_style}"
echo -e "${green}---------------------------------------------------------------------------------------${end_style}"


# check if there are dangling images
dangling_images=$($SUDO docker images -f "dangling=true" -q)
if [ -n "$dangling_images" ]; then
    # if there are dangling images, remove them
    $SUDO docker rmi $dangling_images
fi

# Run the docker container
$SUDO docker pull afterlifexx/upc-register:latest && $SUDO docker run -e REGI_PORT=$REGI_PORT -it --rm -p $REGI_PORT:$REGI_PORT afterlifexx/upc-register:latest

