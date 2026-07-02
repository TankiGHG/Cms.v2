#!/bin/bash

# Styling colors
GREEN='\033[1;32m'
BLUE='\033[1;34m'
RED='\033[1;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}         CMS.v2 - INSTALLER           ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Function to prompt with a default value
prompt() {
    local prompt_text=$1
    local default_value=$2
    local variable_name=$3

    read -p "$prompt_text [$default_value]: " input
    if [ -z "$input" ]; then
        declare -g "$variable_name=$default_value"
    else
        declare -g "$variable_name=$input"
    fi
}

echo -e "${GREEN}--- 1. Server Configuration ---${NC}"
prompt "Port for the Webserver" "3000" PORT
echo ""

echo -e "${GREEN}--- 2. Admin Login Setup ---${NC}"
prompt "Admin Username" "admin" ADMIN_USER
prompt "Admin Password" "changeme123" ADMIN_PASS
echo ""

echo -e "${GREEN}--- 3. Site Branding (editable later in the admin panel) ---${NC}"
prompt "Site name" "My CMS" SITE_NAME
prompt "Tagline" "A flexible, content-managed website" SITE_TAGLINE
echo ""

echo -e "${GREEN}--- 4. SMTP Configuration (optional, leave host empty to skip) ---${NC}"
prompt "SMTP Host (empty = disable email)" "" SMTP_HOST
if [ -n "$SMTP_HOST" ]; then
    prompt "SMTP Port" "587" SMTP_PORT
    prompt "SMTP Username / Auth Email" "noreply@example.com" SMTP_USER
    read -s -p "SMTP Password: " SMTP_PASS
    echo ""
    echo ""
    prompt "Sender Address ('From')" "'$SITE_NAME' <noreply@example.com>" SMTP_FROM
    prompt "Recipient Address ('To')" "inbox@example.com" SMTP_TO
else
    SMTP_PORT="587"; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""; SMTP_TO=""
fi
echo ""

echo -e "${BLUE}Generating .env file...${NC}"

cat > .env <<EOL
# Server Configuration
PORT=$PORT

# Admin Basic Auth Credentials
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS

# Site branding
SITE_NAME=$SITE_NAME
SITE_TAGLINE=$SITE_TAGLINE

# SMTP Configuration
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
SMTP_TO=$SMTP_TO
EOL

echo -e "${GREEN}Success! .env file has been created.${NC}"
echo ""

read -p "Do you want to start the Docker container now? (y/N): " start_docker
if [[ "$start_docker" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Starting Docker containers on Port $PORT...${NC}"
    docker compose up -d --build
    echo -e "${GREEN}App is now running! Visit http://localhost:$PORT${NC}"
else
    echo -e "${BLUE}Setup finished. You can start the app later using 'docker compose up -d'${NC}"
fi
