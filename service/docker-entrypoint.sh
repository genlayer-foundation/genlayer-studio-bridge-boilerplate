#!/bin/sh

# Start the main service in the background
npm start &

# Start the sync service in the background
npm run sync &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $? 