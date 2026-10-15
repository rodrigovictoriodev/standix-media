# MinIO

Compose uses `bitnamilegacy/minio:2025.7.23`, since the upstream Quay image
returns `401 Unauthorized` when pulled without repository access. This
Bitnami Legacy image is archived and no longer receives security updates; use
it only as a compatibility workaround until it can be replaced with a
maintained, accessible S3-compatible image.

The object store API is available at port 9000 inside the Docker network and
the console at port 9001. The existing `minio_data` volume remains mounted at
`/bitnami/minio/data` to preserve stored objects and match the image's expected
data directory. The container starts as root so its initialization can set
ownership on the mounted volume before dropping privileges. The API creates the configured bucket
(`MINIO_BUCKET`) on the first media upload.
