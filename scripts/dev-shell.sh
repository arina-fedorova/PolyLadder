#!/bin/bash

SERVICE=${1:-"api"}

docker-compose -f docker/docker-compose.yml exec "$SERVICE" sh

