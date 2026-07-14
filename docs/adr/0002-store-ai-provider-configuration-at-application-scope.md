# Store AI provider configuration at application scope

OpenAI-compatible provider credentials and model settings belong to the AutoPublish application rather than to a customer workspace. They are shared across workspaces, encrypted with Electron safeStorage, and may be overridden only by explicit operating-system or launch environment variables; workspace `.env` files no longer supply AI settings.
