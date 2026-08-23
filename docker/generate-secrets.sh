#!/bin/bash
# Generate secrets for SparkyFitness Coolify deployment
# Run this script to generate fresh secrets for a NEW deployment
# 
# Usage: bash docker/generate-secrets.sh
#
# IMPORTANT: Only use this for NEW deployments with empty database volumes.
# NEVER regenerate secrets for an existing deployment (will break data access).

echo "==================================================================="
echo "SparkyFitness Secret Generator"
echo "==================================================================="
echo ""
echo "Generating fresh secrets for new deployment..."
echo ""
echo "⚠️  WARNING: These are for NEW deployments only!"
echo "⚠️  DO NOT use these to replace secrets in an existing deployment!"
echo ""
echo "==================================================================="
echo ""

echo "# ==================================================================="
echo "# Database Passwords"
echo "# ==================================================================="
echo "SPARKY_FITNESS_DB_PASSWORD=$(openssl rand -hex 32)"
echo "SPARKY_FITNESS_APP_DB_PASSWORD=$(openssl rand -hex 32)"
echo ""

echo "# ==================================================================="
echo "# Security Secrets"
echo "# ==================================================================="
echo "SPARKY_FITNESS_API_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"
echo ""

echo "==================================================================="
echo "Copy these values into your .env.coolify file, then paste all"
echo "variables from .env.coolify into Coolify's Environment Variables UI."
echo "==================================================================="
