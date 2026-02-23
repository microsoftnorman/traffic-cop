---
name: azure-publish
description: 'Deploy Node.js web app to Azure App Service using az CLI. Use for: publishing to Azure, deploying to App Service, az webapp, production deployment, going live.'
---

# Azure Publish — Deploy to App Service with `az` CLI

## When to Use

- First-time deploy of this app to Azure
- Redeploying after code changes
- Setting up Azure App Service infrastructure from scratch

## Prerequisites

- Azure CLI installed (`az --version`)
- Logged in (`az login`)
- A subscription selected (`az account show`)

Verify before proceeding:

```powershell
az --version
az account show --query "{name:name, id:id}" -o table
```

## Procedure

### Step 1 — Choose names

Pick consistent names for all resources. Use lowercase alphanumeric + hyphens.

| Variable | Example | Notes |
|----------|---------|-------|
| `RESOURCE_GROUP` | `rg-traffic-cop` | Resource group |
| `APP_SERVICE_PLAN` | `plan-traffic-cop` | App Service plan |
| `APP_NAME` | `traffic-cop-<unique>` | Must be globally unique |
| `LOCATION` | `eastus` | Azure region |

Ask the user for these values, or generate `APP_NAME` with a random suffix.

### Step 2 — Create resource group

```powershell
az group create --name $RESOURCE_GROUP --location $LOCATION
```

### Step 3 — Create App Service plan

Use the **Free** tier (F1) by default. Confirm with user before using a paid tier.

```powershell
az appservice plan create --name $APP_SERVICE_PLAN --resource-group $RESOURCE_GROUP --sku F1 --is-linux
```

### Step 4 — Create the web app

```powershell
az webapp create --name $APP_NAME --resource-group $RESOURCE_GROUP --plan $APP_SERVICE_PLAN --runtime "NODE:20-lts"
```

### Step 5 — Configure startup command

This project uses `node server.js` on port 8080. App Service expects port from `$PORT` env var.

**Important**: Check if `server.js` reads `process.env.PORT`. If not, update it:

```javascript
const PORT = process.env.PORT || 8080;
```

Set the startup command:

```powershell
az webapp config set --name $APP_NAME --resource-group $RESOURCE_GROUP --startup-file "node server.js"
```

### Step 6 — Deploy code

Use zip deploy. Create a zip of the project files (exclude `.git`, `node_modules`, `.github`):

```powershell
Compress-Archive -Path index.html, server.js, package.json -DestinationPath deploy.zip -Force
az webapp deploy --name $APP_NAME --resource-group $RESOURCE_GROUP --src-path deploy.zip --type zip
Remove-Item deploy.zip
```

### Step 7 — Verify deployment

```powershell
$url = az webapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query "defaultHostName" -o tsv
Write-Output "App URL: https://$url"
```

Open the URL and confirm the game loads. Check logs if needed:

```powershell
az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP
```

## Quick Redeploy (after code changes)

For subsequent deploys, only Step 6 and 7 are needed:

```powershell
Compress-Archive -Path index.html, server.js, package.json -DestinationPath deploy.zip -Force
az webapp deploy --name $APP_NAME --resource-group $RESOURCE_GROUP --src-path deploy.zip --type zip
Remove-Item deploy.zip
```

## Cleanup

To tear down all Azure resources:

```powershell
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

**Warning**: This deletes everything in the resource group. Confirm with user first.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| App shows "Application Error" | Check `az webapp log tail` for startup errors |
| Port binding fails | Ensure `server.js` uses `process.env.PORT` |
| Webcam not working | App must be served over HTTPS (App Service does this by default) |
| Site returns 404 | Verify zip contains `index.html` and `server.js` at root level |
