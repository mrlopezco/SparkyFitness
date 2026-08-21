#!/bin/bash
# Quick deployment diagnostic script
# Run this on your Coolify server to diagnose the deployment issue

echo "=========================================="
echo "SparkyFitness Deployment Diagnostics"
echo "=========================================="
echo ""

echo "1. Checking container status..."
docker ps | grep sparkyfitness

echo ""
echo "2. Checking if frontend container exists..."
if docker ps | grep -q sparkyfitness-frontend; then
    echo "✓ Frontend container is running"
    
    echo ""
    echo "3. Checking if index.html exists..."
    if docker exec sparkyfitness-frontend test -f /usr/share/nginx/html/index.html; then
        echo "✓ index.html found"
        docker exec sparkyfitness-frontend ls -lh /usr/share/nginx/html/index.html
    else
        echo "✗ ERROR: index.html NOT FOUND!"
        echo "Frontend files were not copied during build."
    fi
    
    echo ""
    echo "4. Checking frontend directory contents..."
    docker exec sparkyfitness-frontend ls -la /usr/share/nginx/html/
    
    echo ""
    echo "5. Checking nginx configuration..."
    docker exec sparkyfitness-frontend cat /etc/nginx/conf.d/default.conf | head -40
    
    echo ""
    echo "6. Checking nginx error logs..."
    docker exec sparkyfitness-frontend tail -20 /var/log/nginx/error.log
    
    echo ""
    echo "7. Testing internal nginx response..."
    docker exec sparkyfitness-frontend curl -s http://localhost:80/ | head -5
    
else
    echo "✗ ERROR: Frontend container is NOT running!"
    echo ""
    echo "Checking frontend container logs..."
    docker logs sparkyfitness-frontend --tail 50
fi

echo ""
echo "=========================================="
echo "Diagnostic complete"
echo "=========================================="
