#!/bin/bash

docker-compose -f docker/docker-compose.yml exec db psql -U dev polyladder

