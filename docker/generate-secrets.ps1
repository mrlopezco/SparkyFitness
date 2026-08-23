# Generate secrets for SparkyFitness Coolify deployment
# Run this script to generate fresh secrets for a NEW deployment
# 
# Usage: powershell docker/generate-secrets.ps1
#
# IMPORTANT: Only use this for NEW deployments with empty database volumes.
# NEVER regenerate secrets for an existing deployment (will break data access).

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "SparkyFitness Secret Generator" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generating fresh secrets for new deployment..." -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  WARNING: These are for NEW deployments only!" -ForegroundColor Red
Write-Host "⚠️  DO NOT use these to replace secrets in an existing deployment!" -ForegroundColor Red
Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

function Get-RandomHex {
    param([int]$Length = 32)
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
}

Write-Host "# ===================================================================" -ForegroundColor Green
Write-Host "# Database Passwords" -ForegroundColor Green
Write-Host "# ===================================================================" -ForegroundColor Green
Write-Host "SPARKY_FITNESS_DB_PASSWORD=$(Get-RandomHex)"
Write-Host "SPARKY_FITNESS_APP_DB_PASSWORD=$(Get-RandomHex)"
Write-Host ""

Write-Host "# ===================================================================" -ForegroundColor Green
Write-Host "# Security Secrets" -ForegroundColor Green
Write-Host "# ===================================================================" -ForegroundColor Green
Write-Host "SPARKY_FITNESS_API_ENCRYPTION_KEY=$(Get-RandomHex)"
Write-Host "BETTER_AUTH_SECRET=$(Get-RandomHex)"
Write-Host ""

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "Copy these values into your .env.coolify file, then paste all" -ForegroundColor Yellow
Write-Host "variables from .env.coolify into Coolify's Environment Variables UI." -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Cyan
