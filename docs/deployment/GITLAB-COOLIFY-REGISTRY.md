# GitLab image publishing and Coolify production deployment

## Deployment ownership

- GitLab CI builds the API, web and backup container images.
- GitLab pushes images to the private registry at `registry.qwerty.co.ke`.
- Coolify deploys the already-built images using `docker-compose.production.yml`.
- The production Compose file must not contain `build:` directives.

## Registry layout

The pipeline publishes these repositories:

- `registry.qwerty.co.ke/jengaflow/api`
- `registry.qwerty.co.ke/jengaflow/web`
- `registry.qwerty.co.ke/jengaflow/backup`

Every published build receives the immutable Git commit SHA tag. Default-branch builds also receive the branch-slug tag; Git tags are also published as image tags. Feature branches and merge requests build the images for validation but do not push deployable tags.

## GitLab CI/CD variables

The pipeline uses the existing GitLab CI/CD variables; do not create duplicate credentials:

| Existing variable | Purpose |
|---|---|
| `DOCKER_REGISTRY_USER` | Registry username |
| `DOCKER_REGISTRY_PASS` | Registry password/token |

Ensure both variables are available to protected default-branch and release pipelines. Keep them masked and protected where the GitLab project settings permit. The pipeline passes the password through `docker login --password-stdin` and does not print it.

The pipeline uses `registry.qwerty.co.ke` and namespace `jengaflow` by default. Change the top-level variables in `.gitlab-ci.yml` if the registry's repository namespace differs.

Use a dedicated robot/service account with write access only to these three repositories. Do not place registry credentials in the repository, Dockerfiles, Compose files, or build arguments.

The GitLab runner must support Docker-in-Docker and privileged mode. The included job uses the Docker 27.5.1 CLI and DinD service with TLS.

## Coolify configuration

1. Create or select the JengaFlow production application in Coolify.
2. Configure it to use the repository's `docker-compose.production.yml` as the Compose file.
3. Configure registry access in Coolify for `registry.qwerty.co.ke` using a **read-only** registry account/token.
4. Ensure the Coolify host can resolve and reach `registry.qwerty.co.ke` over HTTPS.
5. Set the Compose environment variable `REGISTRY_IMAGE_PREFIX=registry.qwerty.co.ke/jengaflow`.
6. Set `IMAGE_TAG` to the exact Git commit SHA that GitLab successfully published.
7. Add the application's production environment variables in Coolify. Use the existing `.env.example` as the reference; never upload it with placeholder values as a production environment file.
8. Configure the domains, proxy routing and persistent volumes in Coolify as required by the deployment.
9. Deploy. Coolify should pull the API, web and backup images; it should not run Docker builds.

### Updating a release

After a successful default-branch pipeline, copy the full `CI_COMMIT_SHA` from the GitLab pipeline and update `IMAGE_TAG` in Coolify to that value. Redeploy to roll forward. To roll back, set `IMAGE_TAG` to a previously published commit SHA and redeploy.

Do not deploy a commit SHA until all three images have been published successfully.

## Important operational notes

- The frontend Vite configuration is compiled into the web image at build time. Auth0 and API URL build arguments have therefore been removed from the production Compose file; configure `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `VITE_AUTH0_REDIRECT_URI` and `VITE_API_BASE_URL` as GitLab CI/CD variables if those values are needed during the web image build. They are public frontend configuration, not secrets.
- Keep database credentials, JWT secrets, mail credentials, SeaweedFS credentials and backup encryption secrets in Coolify runtime environment variables. They must never be baked into images.
- Database migrations remain an explicit, controlled deployment step. Do not assume that starting the API container automatically runs migrations.
- Keep backups disabled until database backup credentials, encryption recipient, retention and a restore test have been verified.
- Configure the registry retention policy so deployed commit-SHA tags are not deleted while they may be needed for rollback.
- This pipeline builds for `linux/amd64`. Change the platform only if the Coolify production host architecture requires it.
- The current repository Dockerfiles install dependencies without a committed lockfile/frozen install. Add and commit a pnpm lockfile and change Docker builds to frozen-lockfile installs before treating builds as fully reproducible.

## Verification checklist

- [ ] GitLab runner can use Docker-in-Docker.
- [ ] Registry push account can authenticate and push to all three image repositories.
- [ ] A default-branch pipeline completes all three image builds and pushes.
- [ ] The three images exist in the registry with the same commit-SHA tag.
- [ ] Coolify can pull all three images with read-only credentials.
- [ ] Production Compose contains no `build:` directives.
- [ ] API and web health checks pass after deployment.
- [ ] Backup and restore are tested before enabling the backup schedule.
