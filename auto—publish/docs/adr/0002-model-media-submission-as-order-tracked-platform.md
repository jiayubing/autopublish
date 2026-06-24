# Model media submission as an order-tracked platform

The media投稿 integration will be implemented as a Platform Adapter, but its successful API response will create a Submission Order rather than immediately mark the Publication Job as fully published. This keeps the Desktop Console and Publishing Core honest about the difference between browser platforms that finish during the run and API media platforms that require follow-up status tracking.
