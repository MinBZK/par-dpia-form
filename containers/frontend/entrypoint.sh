#!/bin/sh
envsubst < /etc/nginx/config.json.template > /tmp/config.json
exec nginx -g 'daemon off;'
