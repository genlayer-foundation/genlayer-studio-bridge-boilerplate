# Generated network manifests

This directory does not contain a default deployment. Generate a manifest from
the contracts deployed for the selected environment, then set `DEPLOYMENT_MANIFEST`
to its path before starting the service.

Generated JSON files are ignored because they contain deployment-specific
addresses. The relay does not use an address from source code or a shared
default. Every address must come from the generated manifest or explicit
environment variables.
