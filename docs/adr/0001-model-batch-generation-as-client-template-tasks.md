# Model batch generation as client-template tasks

AutoPublish models each batch-generation task as one client combined with one platform-owned writing template, while every template for that client shares the same selected customer materials and GEO research answers. This keeps task counts, retries, persistence, review, and future concurrency deterministic without forcing users to configure sources separately for every client-template pair.
