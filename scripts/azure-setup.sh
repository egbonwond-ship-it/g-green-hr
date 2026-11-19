#!/usr/bin/env bash
# One-time Azure setup for the go-green-hr Static Web App and its Azure SQL database.
# Requires the Azure CLI (az login first). Review the variables, then run:
#   bash scripts/azure-setup.sh
set -euo pipefail

APP_NAME="go-green-hr"                 # Static Web App name (portal name)
RG="${RG:-rg-go-green-hr}"
LOCATION="${LOCATION:-westeurope}"     # Static Web Apps regions: westeurope, eastus2, centralus, westus2, eastasia
SQL_SERVER="${SQL_SERVER:-sql-go-green-hr-$RANDOM}"
SQL_DB="${SQL_DB:-go-green-hr}"
SQL_ADMIN="${SQL_ADMIN:-gogreenadmin}"
SQL_PASSWORD="${SQL_PASSWORD:?Set SQL_PASSWORD to a strong password}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

echo "Creating resource group $RG in $LOCATION"
az group create -n "$RG" -l "$LOCATION" -o none

echo "Creating Azure SQL server $SQL_SERVER and serverless database $SQL_DB"
az sql server create -g "$RG" -n "$SQL_SERVER" -l "$LOCATION" -u "$SQL_ADMIN" -p "$SQL_PASSWORD" -o none
az sql db create -g "$RG" -s "$SQL_SERVER" -n "$SQL_DB" --edition GeneralPurpose --compute-model Serverless \
  --family Gen5 --capacity 1 --auto-pause-delay 60 --backup-storage-redundancy Local -o none
# Let Azure services (including the Static Web App's managed Functions) reach the database.
az sql server firewall-rule create -g "$RG" -s "$SQL_SERVER" -n AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none

echo "Creating Static Web App $APP_NAME"
az staticwebapp create -g "$RG" -n "$APP_NAME" -l "$LOCATION" --sku Standard -o none

CONN="Server=tcp:${SQL_SERVER}.database.windows.net,1433;Database=${SQL_DB};User Id=${SQL_ADMIN};Password=${SQL_PASSWORD};Encrypt=true;TrustServerCertificate=false;Connection Timeout=60"
az staticwebapp appsettings set -n "$APP_NAME" -g "$RG" --setting-names \
  "SQL_CONNECTION_STRING=$CONN" "JWT_SECRET=$JWT_SECRET" "NODE_ENV=production" -o none

TOKEN=$(az staticwebapp secrets list -n "$APP_NAME" -g "$RG" --query properties.apiKey -o tsv)
HOST=$(az staticwebapp show -n "$APP_NAME" -g "$RG" --query defaultHostname -o tsv)
echo
echo "Done. Next steps:"
echo "  1. Add this as the GitHub repository secret AZURE_STATIC_WEB_APPS_API_TOKEN:"
echo "     $TOKEN"
echo "  2. Push to main. GitHub Actions tests and deploys the app."
echo "  3. Open https://$HOST and sign in with a demo account, then change the passwords."
